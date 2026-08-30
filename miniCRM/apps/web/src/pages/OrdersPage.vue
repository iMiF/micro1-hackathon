<template>
  <AppLayout>
    <div class="page-header">
      <h1>Orders</h1>
      <router-link class="button" to="/orders/new" data-testid="order-create">Create order</router-link>
    </div>
    <div class="toolbar">
      <div class="field">
        <label for="order-search">Search</label>
        <input id="order-search" v-model="q" type="search" placeholder="Order number or customer" data-testid="order-search" />
      </div>
      <div class="field">
        <label for="status">Status</label>
        <select id="status" v-model="status" data-testid="order-status-filter">
          <option value="">All statuses</option>
          <option v-for="(label, id) in ORDER_STATUS_LABELS" :key="id" :value="id">{{ label }}</option>
        </select>
      </div>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <table>
      <thead>
        <tr>
          <th>Order</th>
          <th>Customer</th>
          <th>Status</th>
          <th>Payment</th>
          <th>Total</th>
          <th>Created</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="order in items" :key="order.id">
          <td><router-link :to="`/orders/${order.id}`">{{ order.orderNumber }}</router-link></td>
          <td>{{ order.customerNameSnapshot }}</td>
          <td><StatusBadge :status-id="order.statusId" /></td>
          <td><span class="badge" :class="`badge-${order.paymentStatus}`">{{ order.paymentStatus }}</span></td>
          <td>{{ formatMoney(order.totalCents) }}</td>
          <td>{{ formatDate(order.createdAt) }}</td>
        </tr>
      </tbody>
    </table>
    <PaginationBar :page="page" :page-size="pageSize" :total="total" @update:page="page = $event" />
  </AppLayout>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { api, ApiError } from '../api.ts'
import AppLayout from '../components/AppLayout.vue'
import PaginationBar from '../components/PaginationBar.vue'
import StatusBadge from '../components/StatusBadge.vue'
import { debounce, formatDate, formatMoney } from '../format.ts'
import { ORDER_STATUS_LABELS } from '../orderStatus.ts'

type OrderListItem = {
  id: number
  orderNumber: string
  customerNameSnapshot: string
  statusId: number
  paymentStatus: string
  totalCents: number
  createdAt: string
}

const q = ref('')
const status = ref('')
const page = ref(1)
const pageSize = 20
const total = ref(0)
const items = ref<OrderListItem[]>([])
const error = ref('')

async function load() {
  error.value = ''
  const params = new URLSearchParams({ page: String(page.value), pageSize: String(pageSize) })
  if (q.value.trim()) params.set('q', q.value.trim())
  if (status.value) params.set('status', String(status.value))
  try {
    const result = await api<{ items: OrderListItem[]; total: number }>(`/api/orders?${params}`)
    items.value = result.items
    total.value = result.total
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Unable to load orders'
  }
}

const loadDebounced = debounce(() => {
  page.value = 1
  void load()
}, 250)

onMounted(load)
watch(q, loadDebounced)
watch([status, page], load)
</script>
