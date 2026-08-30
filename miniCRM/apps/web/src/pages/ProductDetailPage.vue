<template>
  <AppLayout>
    <div v-if="product">
      <div class="page-header">
        <h1>{{ product.name }}</h1>
      </div>
      <div class="card">
        <dl class="dl">
          <dt>SKU</dt>
          <dd>{{ product.sku }}</dd>
          <dt>Price</dt>
          <dd>{{ formatMoney(product.priceCents) }}</dd>
          <dt>Stock</dt>
          <dd>
            {{ product.stockQty }}
            <span v-if="product.stockQty === 0" class="badge badge-out">Out of stock</span>
            <span v-else-if="product.stockQty <= 3" class="badge badge-low">Low stock</span>
          </dd>
          <dt>State</dt>
          <dd>
            <span v-if="product.active" class="badge badge-40">Active</span>
            <span v-else class="badge badge-inactive">Inactive</span>
          </dd>
          <dt>Description</dt>
          <dd>{{ product.description || '—' }}</dd>
        </dl>
      </div>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api.ts'
import AppLayout from '../components/AppLayout.vue'
import { formatMoney } from '../format.ts'

type Product = {
  name: string
  sku: string
  priceCents: number
  stockQty: number
  active: boolean
  description: string | null
}

const route = useRoute()
const product = ref<Product | null>(null)

onMounted(async () => {
  product.value = await api(`/api/products/${route.params.id}`)
})
</script>
