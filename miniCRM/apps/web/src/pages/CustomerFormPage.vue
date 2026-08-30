<template>
  <AppLayout>
    <div class="page-header">
      <h1>{{ isEdit ? 'Edit customer' : 'New customer' }}</h1>
    </div>
    <form class="card" @submit.prevent="onSubmit">
      <p v-if="error" class="error">{{ error }}</p>
      <div class="field-row">
        <div class="field">
          <label for="firstName">First name</label>
          <input id="firstName" v-model="firstName" required />
        </div>
        <div class="field">
          <label for="lastName">Last name</label>
          <input id="lastName" v-model="lastName" required />
        </div>
      </div>
      <div class="field" style="margin-top: 12px">
        <label for="email">Email</label>
        <input id="email" v-model="email" type="email" required />
      </div>
      <div class="field" style="margin-top: 12px">
        <label for="phone">Phone</label>
        <input id="phone" v-model="phone" />
      </div>
      <div class="actions" style="margin-top: 16px">
        <button type="submit" :disabled="busy">{{ isEdit ? 'Save changes' : 'Create customer' }}</button>
        <button type="button" class="secondary" @click="$router.back()">Cancel</button>
      </div>
    </form>
  </AppLayout>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, ApiError } from '../api.ts'
import AppLayout from '../components/AppLayout.vue'

const route = useRoute()
const router = useRouter()
const isEdit = Boolean(route.params.id)
const firstName = ref('')
const lastName = ref('')
const email = ref('')
const phone = ref('')
const version = ref(1)
const error = ref('')
const busy = ref(false)

onMounted(async () => {
  if (!isEdit) return
  const customer = await api<{
    firstName: string
    lastName: string
    email: string
    phone: string | null
    version: number
  }>(`/api/customers/${route.params.id}`)
  firstName.value = customer.firstName
  lastName.value = customer.lastName
  email.value = customer.email
  phone.value = customer.phone ?? ''
  version.value = customer.version
})

async function onSubmit() {
  error.value = ''
  busy.value = true
  try {
    if (isEdit) {
      await api(`/api/customers/${route.params.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          firstName: firstName.value,
          lastName: lastName.value,
          email: email.value,
          phone: phone.value || null,
          version: version.value,
        }),
      })
      await router.push(`/customers/${route.params.id}`)
    } else {
      const created = await api<{ id: number }>('/api/customers', {
        method: 'POST',
        body: JSON.stringify({
          firstName: firstName.value,
          lastName: lastName.value,
          email: email.value,
          phone: phone.value || null,
        }),
      })
      await router.push(`/customers/${created.id}`)
    }
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Unable to save customer'
  } finally {
    busy.value = false
  }
}
</script>
