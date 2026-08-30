<template>
  <div class="login-wrap">
    <form class="card login-card" @submit.prevent="onSubmit">
      <h1>Sign in</h1>
      <p class="muted">Staff access to MiniCRM</p>
      <p v-if="error" class="error">{{ error }}</p>
      <div class="field">
        <label for="email">Email</label>
        <input id="email" v-model="email" type="email" autocomplete="username" required data-testid="login-email" />
      </div>
      <div class="field" style="margin: 12px 0">
        <label for="password">Password</label>
        <input
          id="password"
          v-model="password"
          type="password"
          autocomplete="current-password"
          required
          data-testid="login-password"
        />
      </div>
      <button type="submit" data-testid="login-submit" :disabled="busy">Sign in</button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ApiError } from '../api.ts'
import { login } from '../session.ts'

const router = useRouter()
const email = ref('admin@minicrm.local')
const password = ref('demo123')
const error = ref('')
const busy = ref(false)

async function onSubmit() {
  error.value = ''
  busy.value = true
  try {
    await login(email.value, password.value)
    await router.push('/')
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Unable to sign in'
  } finally {
    busy.value = false
  }
}
</script>
