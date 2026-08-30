import type { Queryable } from './db.ts'

export type AddressSnapshot = {
  label: string
  line1: string
  line2: string | null
  city: string
  regionId: number
  regionCode: string
  regionName: string
  postalCode: string
  countryCode: string
  countryName: string
}

export type QuoteItem = {
  productId: number
  quantity: number
  sku: string
  name: string
  unitPriceCents: number
}

export function mapCustomer(row: Record<string, unknown>) {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    archived: row.archived,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapAddress(row: Record<string, unknown>) {
  return {
    id: row.id,
    customerId: row.customer_id,
    label: row.label,
    line1: row.line1,
    line2: row.line2,
    city: row.city,
    regionId: row.region_id,
    regionCode: row.region_code,
    regionName: row.region_name,
    postalCode: row.postal_code,
    countryCode: row.country_code,
    countryName: row.country_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapProduct(row: Record<string, unknown>) {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    description: row.description,
    priceCents: row.price_cents,
    stockQty: row.stock_qty,
    active: row.active,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapOrderListItem(row: Record<string, unknown>) {
  return {
    id: row.id,
    orderNumber: row.order_number,
    customerId: row.customer_id,
    customerNameSnapshot: row.customer_name_snapshot,
    customerEmailSnapshot: row.customer_email_snapshot,
    statusId: row.status_id,
    paymentStatus: row.payment_status,
    totalCents: row.total_cents,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapOrderDetail(row: Record<string, unknown>, items: Record<string, unknown>[]) {
  return {
    id: row.id,
    orderNumber: row.order_number,
    customerId: row.customer_id,
    customerNameSnapshot: row.customer_name_snapshot,
    customerEmailSnapshot: row.customer_email_snapshot,
    addressSnapshot: row.address_snapshot,
    statusId: row.status_id,
    paymentStatus: row.payment_status,
    subtotalCents: row.subtotal_cents,
    shippingCents: row.shipping_cents,
    taxCents: row.tax_cents,
    totalCents: row.total_cents,
    shippingMethodId: row.shipping_method_id,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: items.map((item) => ({
      id: item.id,
      productId: item.product_id,
      skuSnapshot: item.sku_snapshot,
      nameSnapshot: item.name_snapshot,
      unitPriceCents: item.unit_price_cents,
      quantity: item.quantity,
    })),
  }
}

export function mapNote(row: Record<string, unknown>) {
  return {
    id: row.id,
    orderId: row.order_id,
    body: row.body,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
  }
}

export function mapActivity(row: Record<string, unknown>) {
  return {
    id: row.id,
    orderId: row.order_id,
    eventType: row.event_type,
    data: row.data,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
  }
}

export const ADDRESS_SELECT = `
  a.id, a.customer_id, a.label, a.line1, a.line2, a.city, a.region_id,
  r.code AS region_code, r.name AS region_name,
  a.postal_code, a.country_code, c.name AS country_name,
  a.created_at, a.updated_at
`

export async function getAddressWithGeo(db: Queryable, addressId: number, customerId?: number) {
  const params: unknown[] = [addressId]
  let sql = `
    SELECT ${ADDRESS_SELECT}
    FROM customer_addresses a
    JOIN regions r ON r.id = a.region_id
    JOIN countries c ON c.code = a.country_code
    WHERE a.id = $1
  `
  if (customerId !== undefined) {
    params.push(customerId)
    sql += ` AND a.customer_id = $2`
  }
  const result = await db.query(sql, params)
  return result.rows[0] as Record<string, unknown> | undefined
}

export function toAddressSnapshot(row: Record<string, unknown>): AddressSnapshot {
  return {
    label: String(row.label),
    line1: String(row.line1),
    line2: row.line2 == null ? null : String(row.line2),
    city: String(row.city),
    regionId: Number(row.region_id),
    regionCode: String(row.region_code),
    regionName: String(row.region_name),
    postalCode: String(row.postal_code),
    countryCode: String(row.country_code),
    countryName: String(row.country_name),
  }
}
