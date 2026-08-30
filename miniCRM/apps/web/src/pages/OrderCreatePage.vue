<template>
  <AppLayout>
    <div class="page-header">
      <h1>Create order</h1>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <form class="card" @submit.prevent="createOrder">
      <div class="field">
        <label for="customer-q">Customer</label>
        <input
          id="customer-q"
          v-model="customerQuery"
          type="search"
          placeholder="Search customers"
          autocomplete="off"
          data-testid="order-customer-search"
        />
        <div v-if="customerResults.length" class="suggest">
          <button
            v-for="item in customerResults"
            :key="item.id"
            type="button"
            @click="selectCustomer(item)"
          >
            {{ item.name }} · {{ item.email }}
          </button>
        </div>
        <p v-if="selectedCustomer" class="muted">Selected: {{ selectedCustomer.name }}</p>
      </div>

      <div class="field" style="margin-top: 16px">
        <label for="address">Shipping address</label>
        <select id="address" v-model.number="selectedAddressId" :disabled="!addresses.length" data-testid="order-address">
          <option :value="0" disabled>Select address</option>
          <option v-for="address in addresses" :key="address.id" :value="address.id">
            {{ address.label }} — {{ address.line1 }}, {{ address.city }}
          </option>
        </select>
      </div>

      <div class="field" style="margin-top: 16px">
        <label for="product-q">Add product</label>
        <input id="product-q" v-model="productQuery" type="search" placeholder="Search products" autocomplete="off" />
        <div v-if="productResults.length" class="suggest">
          <button v-for="item in productResults" :key="item.id" type="button" @click="addProduct(item)">
            {{ item.name }} · {{ formatMoney(item.priceCents) }}
            <span v-if="item.stockQty === 0" class="badge badge-out">Out of stock</span>
            <span v-else-if="item.stockQty <= 3" class="badge badge-low">Low stock ({{ item.stockQty }})</span>
          </button>
        </div>
      </div>

      <div v-if="lines.length" style="margin-top: 12px">
        <div v-for="line in lines" :key="line.product.id" class="line-item">
          <div>
            {{ line.product.name }}
            <div class="muted">{{ line.product.sku }} · stock {{ line.product.stockQty }}</div>
          </div>
          <input v-model.number="line.quantity" type="number" min="1" :max="Math.max(line.product.stockQty, 1)" />
          <button type="button" class="secondary" @click="removeLine(line.product.id)">Remove</button>
        </div>
      </div>

      <div v-if="shippingOptions.length" style="margin-top: 16px">
        <h3>Shipping</h3>
        <label v-for="option in shippingOptions" :key="option.methodId" class="radio-card">
          <input v-model.number="selectedMethodId" type="radio" name="shipping" :value="option.methodId" />
          <span>
            <strong>{{ option.name }}</strong>
            · {{ formatMoney(option.priceCents) }}
            · {{ option.estimatedDays[0] }}–{{ option.estimatedDays[1] }} days
          </span>
        </label>
      </div>

      <div v-if="quote" class="totals" style="margin-top: 16px">
        <div><span>Subtotal</span><span>{{ formatMoney(quote.subtotalCents) }}</span></div>
        <div><span>Shipping</span><span>{{ formatMoney(quote.shippingCents) }}</span></div>
        <div><span>Tax</span><span>{{ formatMoney(quote.taxCents) }}</span></div>
        <div class="grand"><span>Total</span><span>{{ formatMoney(quote.totalCents) }}</span></div>
      </div>

      <div class="field" style="margin-top: 16px">
        <label for="order-note">Internal note (optional)</label>
        <textarea id="order-note" v-model="note"></textarea>
      </div>

      <button
        type="submit"
        style="margin-top: 16px"
        data-testid="order-create-submit"
        :disabled="!quote || busy"
      >
        Create order
      </button>
    </form>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api, ApiError } from '../api.ts'
import AppLayout from '../components/AppLayout.vue'
import { debounce, formatMoney } from '../format.ts'

type SuggestCustomer = { id: number; name: string; email: string }
type Address = { id: number; label: string; line1: string; city: string }
type SuggestProduct = { id: number; sku: string; name: string; priceCents: number; stockQty: number }
type ShippingOption = { methodId: number; name: string; priceCents: number; estimatedDays: [number, number] }
type Quote = {
  quoteId: string
  subtotalCents: number
  shippingCents: number
  taxCents: number
  totalCents: number
}

const router = useRouter()
const customerQuery = ref('')
const customerResults = ref<SuggestCustomer[]>([])
const selectedCustomer = ref<SuggestCustomer | null>(null)
const addresses = ref<Address[]>([])
const selectedAddressId = ref(0)
const productQuery = ref('')
const productResults = ref<SuggestProduct[]>([])
const lines = ref<{ product: SuggestProduct; quantity: number }[]>([])
const shippingOptions = ref<ShippingOption[]>([])
const selectedMethodId = ref(0)
const quote = ref<Quote | null>(null)
const note = ref('')
const error = ref('')
const busy = ref(false)

const searchCustomers = debounce(async () => {
  const q = customerQuery.value.trim()
  if (!q) {
    customerResults.value = []
    return
  }
  customerResults.value = await api(`/api/customers/suggest?q=${encodeURIComponent(q)}`)
}, 250)

const searchProducts = debounce(async () => {
  const q = productQuery.value.trim()
  if (!q) {
    productResults.value = []
    return
  }
  productResults.value = await api(`/api/products/suggest?q=${encodeURIComponent(q)}`)
}, 250)

watch(customerQuery, searchCustomers)
watch(productQuery, searchProducts)

async function selectCustomer(item: SuggestCustomer) {
  selectedCustomer.value = item
  customerQuery.value = item.name
  customerResults.value = []
  selectedAddressId.value = 0
  shippingOptions.value = []
  selectedMethodId.value = 0
  quote.value = null
  addresses.value = await api(`/api/customers/${item.id}/addresses`)
}

function addProduct(product: SuggestProduct) {
  productQuery.value = ''
  productResults.value = []
  const existing = lines.value.find((line) => line.product.id === product.id)
  if (existing) {
    existing.quantity += 1
    return
  }
  lines.value.push({ product, quantity: 1 })
}

function removeLine(productId: number) {
  lines.value = lines.value.filter((line) => line.product.id !== productId)
}

watch(
  [selectedAddressId, lines],
  async () => {
    quote.value = null
    if (!selectedAddressId.value || lines.value.length === 0) {
      shippingOptions.value = []
      selectedMethodId.value = 0
      return
    }
    try {
      const result = await api<{ options: ShippingOption[] }>('/api/shipping/options', {
        method: 'POST',
        body: JSON.stringify({
          addressId: selectedAddressId.value,
          items: lines.value.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
        }),
      })
      shippingOptions.value = result.options
      if (!result.options.some((option) => option.methodId === selectedMethodId.value)) {
        selectedMethodId.value = 0
      }
    } catch (err) {
      error.value = err instanceof ApiError ? err.message : 'Unable to load shipping options'
    }
  },
  { deep: true },
)

watch([selectedMethodId, selectedAddressId, lines], async () => {
  quote.value = null
  if (!selectedCustomer.value || !selectedAddressId.value || !selectedMethodId.value || lines.value.length === 0) {
    return
  }
  try {
    quote.value = await api('/api/order-quotes', {
      method: 'POST',
      body: JSON.stringify({
        customerId: selectedCustomer.value.id,
        addressId: selectedAddressId.value,
        shippingMethodId: selectedMethodId.value,
        items: lines.value.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
      }),
    })
    error.value = ''
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Unable to create quote'
  }
}, { deep: true })

async function createOrder() {
  if (!quote.value) return
  busy.value = true
  error.value = ''
  try {
    const created = await api<{ id: number }>('/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        quoteId: quote.value.quoteId,
        note: note.value || undefined,
      }),
    })
    await router.push(`/orders/${created.id}`)
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Unable to create order'
  } finally {
    busy.value = false
  }
}
</script>
