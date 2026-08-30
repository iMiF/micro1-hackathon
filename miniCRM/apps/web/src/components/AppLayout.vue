<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">MiniCRM</div>
      <router-link class="nav-link" to="/" active-class="" exact-active-class="router-link-active" data-testid="nav-dashboard">Dashboard</router-link>
      <router-link class="nav-link" to="/customers" data-testid="nav-customers">Customers</router-link>
      <router-link class="nav-link" to="/orders" data-testid="nav-orders">Orders</router-link>
      <router-link class="nav-link" to="/products" data-testid="nav-products">Products</router-link>
      <div class="sidebar-footer">
        <div>{{ user?.name }}</div>
        <button class="secondary" type="button" style="margin-top: 8px" @click="onLogout">Log out</button>
      </div>
    </aside>
    <main class="main">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { getCurrentUser, logout } from '../session.ts'

const router = useRouter()
const user = getCurrentUser()

async function onLogout() {
  await logout()
  await router.push('/login')
}
</script>
