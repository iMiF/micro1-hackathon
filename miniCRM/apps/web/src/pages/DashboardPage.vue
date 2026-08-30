<template>
  <AppLayout>
    <div class="page-header">
      <h1>Dashboard</h1>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <div class="grid-metrics">
      <div class="card">
        <div class="muted">Revenue (30 days)</div>
        <div class="metric-value">{{ formatMoney(summary?.revenueCents ?? 0) }}</div>
      </div>
      <div class="card">
        <div class="muted">Paid orders (30 days)</div>
        <div class="metric-value">{{ summary?.orderCount ?? 0 }}</div>
      </div>
      <div class="card">
        <div class="muted">Active customers</div>
        <div class="metric-value">{{ summary?.customerCount ?? 0 }}</div>
      </div>
    </div>
    <div class="card">
      <h2>Orders by status</h2>
      <table>
        <thead>
          <tr>
            <th>Status</th>
            <th>Count</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in summary?.ordersByStatus ?? []" :key="row.statusId">
            <td><StatusBadge :status-id="row.statusId" /></td>
            <td>{{ row.count }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="card">
      <h2>Recent orders</h2>
      <table>
        <thead>
          <tr>
            <th>Order</th>
            <th>Customer</th>
            <th>Status</th>
            <th>Total</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="order in recent" :key="order.id">
            <td><router-link :to="`/orders/${order.id}`">{{ order.orderNumber }}</router-link></td>
            <td>{{ order.customerNameSnapshot }}</td>
            <td><StatusBadge :status-id="order.statusId" /></td>
            <td>{{ formatMoney(order.totalCents) }}</td>
            <td>{{ formatDate(order.createdAt) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api, ApiError } from '../api.ts'
import AppLayout from '../components/AppLayout.vue'
import StatusBadge from '../components/StatusBadge.vue'
import { formatDate, formatMoney } from '../format.ts'

type Summary = {
  revenueCents: number
  orderCount: number
  customerCount: number
  ordersByStatus: { statusId: number; count: number }[]
}

type OrderListItem = {
  id: number
  orderNumber: string
  customerNameSnapshot: string
  statusId: number
  totalCents: number
  createdAt: string
}

const summary = ref<Summary | null>(null)
const recent = ref<OrderListItem[]>([])
const error = ref('')

onMounted(async () => {
  try {
    summary.value = await api('/api/dashboard/summary?period=30d')
    const orders = await api<{ items: OrderListItem[] }>('/api/orders?page=1&pageSize=5')
    recent.value = orders.items
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Unable to load dashboard'
  }
})
</script>
