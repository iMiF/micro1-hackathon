<template>
  <AppLayout>
    <div v-if="order">
      <div class="page-header">
        <h1>{{ order.orderNumber }}</h1>
        <div class="actions">
          <button
            v-for="action in statusActions(order.statusId)"
            :key="action.statusId"
            type="button"
            :class="action.danger ? 'danger' : ''"
            @click="changeStatus(action.statusId)"
          >
            {{ action.label }}
          </button>
          <button
            v-if="order.statusId === ORDER_STATUS.DRAFT"
            type="button"
            class="danger"
            @click="confirmOpen = true"
          >
            Delete draft
          </button>
        </div>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
      <div class="card">
        <dl class="dl">
          <dt>Customer</dt>
          <dd>
            <router-link :to="`/customers/${order.customerId}`">{{ order.customerNameSnapshot }}</router-link>
            <div class="muted">{{ order.customerEmailSnapshot }}</div>
          </dd>
          <dt>Status</dt>
          <dd><StatusBadge :status-id="order.statusId" /></dd>
          <dt>Payment</dt>
          <dd><span class="badge" :class="`badge-${order.paymentStatus}`">{{ order.paymentStatus }}</span></dd>
          <dt>Ship to</dt>
          <dd>
            {{ order.addressSnapshot.label }}<br />
            {{ order.addressSnapshot.line1 }}<br />
            {{ order.addressSnapshot.city }} {{ order.addressSnapshot.postalCode }}<br />
            {{ order.addressSnapshot.regionName }}, {{ order.addressSnapshot.countryName }}
          </dd>
        </dl>
      </div>
      <div class="card">
        <h2>Line items</h2>
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Product</th>
              <th>Qty</th>
              <th>Unit</th>
              <th>Line</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in order.items" :key="item.id">
              <td>{{ item.skuSnapshot }}</td>
              <td>{{ item.nameSnapshot }}</td>
              <td>{{ item.quantity }}</td>
              <td>{{ formatMoney(item.unitPriceCents) }}</td>
              <td>{{ formatMoney(item.unitPriceCents * item.quantity) }}</td>
            </tr>
          </tbody>
        </table>
        <div class="totals">
          <div><span>Subtotal</span><span>{{ formatMoney(order.subtotalCents) }}</span></div>
          <div><span>Shipping</span><span>{{ formatMoney(order.shippingCents) }}</span></div>
          <div><span>Tax</span><span>{{ formatMoney(order.taxCents) }}</span></div>
          <div class="grand"><span>Total</span><span>{{ formatMoney(order.totalCents) }}</span></div>
        </div>
      </div>
      <div class="card">
        <h2>Internal notes</h2>
        <form @submit.prevent="addNote">
          <label for="note">Add note</label>
          <textarea id="note" v-model="noteBody" required></textarea>
          <button type="submit" style="margin-top: 8px">Add note</button>
        </form>
      </div>
      <div class="card">
        <h2>Activity</h2>
        <ul class="activity">
          <li v-for="event in activity" :key="event.id">
            <strong>{{ event.eventType }}</strong>
            <span class="muted"> · {{ formatDate(event.createdAt) }}</span>
            <div class="muted">{{ formatActivity(event) }}</div>
          </li>
        </ul>
      </div>
    </div>
    <ConfirmDialog
      :open="confirmOpen"
      title="Delete draft order permanently?"
      text="This action cannot be undone."
      @cancel="confirmOpen = false"
      @accept="deleteDraft"
    />
  </AppLayout>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, ApiError } from '../api.ts'
import AppLayout from '../components/AppLayout.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import StatusBadge from '../components/StatusBadge.vue'
import { formatDate, formatMoney } from '../format.ts'
import { ORDER_STATUS, statusActions, statusLabel } from '../orderStatus.ts'

type Order = {
  id: number
  orderNumber: string
  customerId: number
  customerNameSnapshot: string
  customerEmailSnapshot: string
  addressSnapshot: {
    label: string
    line1: string
    city: string
    postalCode: string
    regionName: string
    countryName: string
  }
  statusId: number
  paymentStatus: string
  subtotalCents: number
  shippingCents: number
  taxCents: number
  totalCents: number
  version: number
  items: {
    id: number
    skuSnapshot: string
    nameSnapshot: string
    unitPriceCents: number
    quantity: number
  }[]
}

type Activity = {
  id: number
  eventType: string
  data: Record<string, unknown>
  createdAt: string
}

const route = useRoute()
const router = useRouter()
const order = ref<Order | null>(null)
const activity = ref<Activity[]>([])
const noteBody = ref('')
const error = ref('')
const confirmOpen = ref(false)

async function load() {
  const id = route.params.id
  order.value = await api(`/api/orders/${id}`)
  activity.value = await api(`/api/orders/${id}/activity`)
}

async function changeStatus(statusId: number) {
  if (!order.value) return
  error.value = ''
  try {
    await api(`/api/orders/${order.value.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ statusId, version: order.value.version }),
    })
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Unable to change status'
  }
}

async function addNote() {
  if (!order.value) return
  error.value = ''
  try {
    await api(`/api/orders/${order.value.id}/notes`, {
      method: 'POST',
      body: JSON.stringify({ body: noteBody.value }),
    })
    noteBody.value = ''
    activity.value = await api(`/api/orders/${order.value.id}/activity`)
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Unable to add note'
  }
}

async function deleteDraft() {
  if (!order.value) return
  try {
    await api(`/api/orders/${order.value.id}`, { method: 'DELETE' })
    await router.push('/orders')
  } catch (err) {
    confirmOpen.value = false
    error.value = err instanceof ApiError ? err.message : 'Unable to delete order'
  }
}

function formatActivity(event: Activity): string {
  if (event.eventType === 'STATUS_CHANGED') {
    return `${statusLabel(Number(event.data.fromStatusId))} → ${statusLabel(Number(event.data.toStatusId))}`
  }
  if (event.eventType === 'NOTE_ADDED') {
    return String(event.data.body ?? '')
  }
  return ''
}

onMounted(load)
</script>
