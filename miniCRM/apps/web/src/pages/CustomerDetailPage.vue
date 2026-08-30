<template>
  <AppLayout>
    <div v-if="customer">
      <div class="page-header">
        <h1>{{ customer.firstName }} {{ customer.lastName }}</h1>
        <div class="actions">
          <router-link class="button secondary" :to="`/customers/${customer.id}/edit`">Edit</router-link>
          <button type="button" class="secondary" @click="toggleArchive">
            {{ customer.archived ? 'Unarchive' : 'Archive' }}
          </button>
          <button type="button" class="danger" @click="confirmOpen = true">Delete</button>
        </div>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
      <div class="card">
        <dl class="dl">
          <dt>Email</dt>
          <dd>{{ customer.email }}</dd>
          <dt>Phone</dt>
          <dd>{{ customer.phone || '—' }}</dd>
          <dt>State</dt>
          <dd>
            <span v-if="customer.archived" class="badge badge-archived">Archived</span>
            <span v-else class="badge badge-40">Active</span>
          </dd>
        </dl>
      </div>
      <div class="card">
        <div class="page-header">
          <h2>Addresses</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Label</th>
              <th>Address</th>
              <th>Region</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="address in addresses" :key="address.id">
              <td>{{ address.label }}</td>
              <td>{{ address.line1 }}, {{ address.city }} {{ address.postalCode }}</td>
              <td>{{ address.regionName }}, {{ address.countryName }}</td>
            </tr>
          </tbody>
        </table>
        <form style="margin-top: 16px" @submit.prevent="saveAddress">
          <h3>{{ editingAddressId ? 'Edit address' : 'Add address' }}</h3>
          <div class="field-row">
            <div class="field">
              <label for="label">Label</label>
              <input id="label" v-model="form.label" required />
            </div>
            <div class="field">
              <label for="line1">Line 1</label>
              <input id="line1" v-model="form.line1" required />
            </div>
          </div>
          <div class="field-row" style="margin-top: 8px">
            <div class="field">
              <label for="line2">Line 2</label>
              <input id="line2" v-model="form.line2" />
            </div>
            <div class="field">
              <label for="city">City</label>
              <input id="city" v-model="form.city" required />
            </div>
          </div>
          <div class="field-row" style="margin-top: 8px">
            <div class="field">
              <label for="country">Country</label>
              <select id="country" v-model="form.countryCode" required>
                <option value="" disabled>Select country</option>
                <option v-for="country in countries" :key="country.code" :value="country.code">
                  {{ country.name }}
                </option>
              </select>
            </div>
            <div class="field">
              <label for="region">Region</label>
              <select id="region" v-model="form.regionId" required :disabled="!form.countryCode">
                <option :value="0" disabled>Select region</option>
                <option v-for="region in regions" :key="region.id" :value="region.id">
                  {{ region.name }}
                </option>
              </select>
            </div>
          </div>
          <div class="field" style="margin-top: 8px">
            <label for="postal">Postal code</label>
            <input id="postal" v-model="form.postalCode" required />
          </div>
          <div class="actions" style="margin-top: 12px">
            <button type="submit">{{ editingAddressId ? 'Save address' : 'Add address' }}</button>
          </div>
        </form>
      </div>
    </div>
    <ConfirmDialog
      :open="confirmOpen"
      title="Delete customer?"
      text="This action is permanent. Customers with order history cannot be deleted."
      @cancel="confirmOpen = false"
      @accept="deleteCustomer"
    />
  </AppLayout>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, ApiError } from '../api.ts'
import AppLayout from '../components/AppLayout.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'

type Customer = {
  id: number
  firstName: string
  lastName: string
  email: string
  phone: string | null
  archived: boolean
  version: number
}

type Address = {
  id: number
  label: string
  line1: string
  city: string
  postalCode: string
  regionName: string
  countryName: string
}

const route = useRoute()
const router = useRouter()
const customer = ref<Customer | null>(null)
const addresses = ref<Address[]>([])
const countries = ref<{ code: string; name: string }[]>([])
const regions = ref<{ id: number; name: string }[]>([])
const error = ref('')
const confirmOpen = ref(false)
const editingAddressId = ref<number | null>(null)
const form = reactive({
  label: 'Home',
  line1: '',
  line2: '',
  city: '',
  countryCode: '',
  regionId: 0,
  postalCode: '',
})

async function load() {
  const id = route.params.id
  customer.value = await api(`/api/customers/${id}`)
  addresses.value = await api(`/api/customers/${id}/addresses`)
  countries.value = await api('/api/countries')
}

async function toggleArchive() {
  if (!customer.value) return
  error.value = ''
  try {
    customer.value = await api(`/api/customers/${customer.value.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ archived: !customer.value.archived, version: customer.value.version }),
    })
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Unable to update customer'
  }
}

async function deleteCustomer() {
  if (!customer.value) return
  error.value = ''
  try {
    await api(`/api/customers/${customer.value.id}`, { method: 'DELETE' })
    await router.push('/customers')
  } catch (err) {
    confirmOpen.value = false
    error.value = err instanceof ApiError ? err.message : 'Unable to delete customer'
  }
}

async function saveAddress() {
  if (!customer.value) return
  error.value = ''
  const payload = {
    label: form.label,
    line1: form.line1,
    line2: form.line2 || null,
    city: form.city,
    countryCode: form.countryCode,
    regionId: Number(form.regionId),
    postalCode: form.postalCode,
  }
  try {
    if (editingAddressId.value) {
      await api(`/api/customers/${customer.value.id}/addresses/${editingAddressId.value}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
    } else {
      await api(`/api/customers/${customer.value.id}/addresses`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    }
    addresses.value = await api(`/api/customers/${customer.value.id}/addresses`)
    form.line1 = ''
    form.line2 = ''
    form.city = ''
    form.postalCode = ''
    editingAddressId.value = null
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Unable to save address'
  }
}

watch(
  () => form.countryCode,
  async (code, previous) => {
    if (!code) {
      regions.value = []
      return
    }
    regions.value = await api(`/api/regions?country=${encodeURIComponent(code)}`)
    if (previous && previous !== code) {
      form.regionId = 0
    }
  },
)

onMounted(load)
</script>
