<template>
  <AppLayout>
    <div class="page-header">
      <h1>Products</h1>
    </div>
    <div class="toolbar">
      <div class="field">
        <label for="product-search">Search</label>
        <input id="product-search" v-model="q" type="search" placeholder="Name or SKU" data-testid="product-search" />
      </div>
      <div class="field">
        <label for="active">Availability</label>
        <select id="active" v-model="active">
          <option value="">All</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <table>
      <thead>
        <tr>
          <th>SKU</th>
          <th>Name</th>
          <th>Price</th>
          <th>Stock</th>
          <th>State</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="product in items" :key="product.id">
          <td><router-link :to="`/products/${product.id}`">{{ product.sku }}</router-link></td>
          <td>{{ product.name }}</td>
          <td>{{ formatMoney(product.priceCents) }}</td>
          <td>
            {{ product.stockQty }}
            <span v-if="product.stockQty === 0" class="badge badge-out">Out of stock</span>
            <span v-else-if="product.stockQty <= 3" class="badge badge-low">Low</span>
          </td>
          <td>
            <span v-if="product.active" class="badge badge-40">Active</span>
            <span v-else class="badge badge-inactive">Inactive</span>
          </td>
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
import { debounce, formatMoney } from '../format.ts'

type Product = {
  id: number
  sku: string
  name: string
  priceCents: number
  stockQty: number
  active: boolean
}

const q = ref('')
const active = ref('')
const page = ref(1)
const pageSize = 20
const total = ref(0)
const items = ref<Product[]>([])
const error = ref('')

async function load() {
  error.value = ''
  const params = new URLSearchParams({ page: String(page.value), pageSize: String(pageSize) })
  if (q.value.trim()) params.set('q', q.value.trim())
  if (active.value !== '') params.set('active', active.value)
  try {
    const result = await api<{ items: Product[]; total: number }>(`/api/products?${params}`)
    items.value = result.items
    total.value = result.total
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Unable to load products'
  }
}

const loadDebounced = debounce(() => {
  page.value = 1
  void load()
}, 250)

onMounted(load)
watch(q, loadDebounced)
watch([active, page], load)
</script>
