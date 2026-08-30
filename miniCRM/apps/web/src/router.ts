import { createRouter, createWebHistory } from 'vue-router'
import { fetchSession } from './session.ts'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: () => import('./pages/LoginPage.vue'), meta: { public: true } },
    { path: '/', component: () => import('./pages/DashboardPage.vue') },
    { path: '/customers', component: () => import('./pages/CustomersPage.vue') },
    { path: '/customers/new', component: () => import('./pages/CustomerFormPage.vue') },
    { path: '/customers/:id/edit', component: () => import('./pages/CustomerFormPage.vue') },
    { path: '/customers/:id', component: () => import('./pages/CustomerDetailPage.vue') },
    { path: '/orders', component: () => import('./pages/OrdersPage.vue') },
    { path: '/orders/new', component: () => import('./pages/OrderCreatePage.vue') },
    { path: '/orders/:id', component: () => import('./pages/OrderDetailPage.vue') },
    { path: '/products', component: () => import('./pages/ProductsPage.vue') },
    { path: '/products/:id', component: () => import('./pages/ProductDetailPage.vue') },
  ],
})

router.beforeEach(async (to) => {
  if (to.meta.public) return true
  const user = await fetchSession()
  if (!user) return '/login'
  return true
})

export default router
