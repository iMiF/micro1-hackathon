<template>
  <AppLayout>
    <div class="page-header">
      <h1>Customers</h1>
      <router-link class="button" to="/customers/new" data-testid="customer-create">Add customer</router-link>
    </div>
    <div class="toolbar">
      <div class="field">
        <label for="customer-search">Search</label>
        <input
          id="customer-search"
          v-model="q"
          type="search"
          placeholder="Name or email"
          data-testid="customer-search"
        />
      </div>
      <div class="field">
        <label for="archived">Status</label>
        <select id="archived" v-model="archived" data-testid="customer-archived-filter">
          <option value="false">Active</option>
          <option value="true">Archived</option>
          <option value="">All</option>
        </select>
      </div>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th>Phone</th>
          <th>State</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="customer in items" :key="customer.id">
          <td>
            <router-link :to="`/customers/${customer.id}`">{{ customer.firstName }} {{ customer.lastName }}</router-link>
          </td>
          <td>{{ customer.email }}</td>
          <td>{{ customer.phone || '—' }}</td>
          <td>
            <span v-if="customer.archived" class="badge badge-archived">Archived</span>
            <span v-else class="badge badge-40">Active</span>
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
import { debounce } from '../format.ts'

type Customer = {
  id: number
  firstName: string
  lastName: string
  email: string
  phone: string | null
  archived: boolean
}

const q = ref('')
const archived = ref('false')
const page = ref(1)
const pageSize = 20
const total = ref(0)
const items = ref<Customer[]>([])
const error = ref('')

async function load() {
  error.value = ''
  const params = new URLSearchParams({
    page: String(page.value),
    pageSize: String(pageSize),
  })
  if (q.value.trim()) params.set('q', q.value.trim())
  if (archived.value !== '') params.set('archived', archived.value)
  try {
    const result = await api<{ items: Customer[]; total: number }>(`/api/customers?${params}`)
    items.value = result.items
    total.value = result.total
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Unable to load customers'
  }
}

const loadDebounced = debounce(() => {
  page.value = 1
  void load()
}, 250)

onMounted(load)
watch(q, loadDebounced)
watch([archived, page], load)
</script>
