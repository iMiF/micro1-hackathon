import type { PoolClient } from 'pg'
import { findShippingOption } from './domain/shipping.ts'
import { calculateTaxCents } from './domain/tax.ts'
import { ORDER_STATUS } from './domain/status.ts'
import { hashPassword } from './password.ts'
import type { AddressSnapshot } from './mappers.ts'

type SeedAddress = {
  id: number
  customerId: number
  label: string
  line1: string
  line2?: string | null
  city: string
  regionId: number
  postalCode: string
  countryCode: string
}

type SeedItem = { productId: number; quantity: number }

export async function seedDatabase(client: PoolClient): Promise<void> {
  const passwordHash = await hashPassword('demo123')

  await client.query(
    `INSERT INTO staff_users (id, email, password_hash, name, created_at)
     VALUES (1, 'admin@minicrm.local', $1, 'Demo Admin', NOW() - INTERVAL '120 days')`,
    [passwordHash],
  )

  await client.query(`
    INSERT INTO countries (code, name) VALUES
      ('CA', 'Canada'),
      ('US', 'United States')
  `)

  await client.query(`
    INSERT INTO regions (id, country_code, code, name) VALUES
      (11, 'CA', 'ON', 'Ontario'),
      (12, 'CA', 'BC', 'British Columbia'),
      (13, 'CA', 'AB', 'Alberta'),
      (14, 'CA', 'QC', 'Quebec'),
      (21, 'US', 'NY', 'New York'),
      (22, 'US', 'CA', 'California'),
      (23, 'US', 'WA', 'Washington'),
      (24, 'US', 'FL', 'Florida')
  `)

  await client.query(`
    INSERT INTO customers (id, email, first_name, last_name, phone, archived, version, created_at, updated_at) VALUES
      (101, 'alice@example.test', 'Alice', 'Chen', '+1-416-555-0101', FALSE, 1, NOW() - INTERVAL '90 days', NOW() - INTERVAL '12 days'),
      (102, 'bob@example.test', 'Bob', 'Martin', '+1-613-555-0102', FALSE, 1, NOW() - INTERVAL '80 days', NOW() - INTERVAL '80 days'),
      (103, 'carlos@example.test', 'Carlos', 'Rivera', '+1-514-555-0103', TRUE, 3, NOW() - INTERVAL '70 days', NOW() - INTERVAL '8 days'),
      (104, 'diana@example.test', 'Diana', 'Prince', '+1-416-555-0104', FALSE, 1, NOW() - INTERVAL '60 days', NOW() - INTERVAL '20 days'),
      (105, 'evan@example.test', 'Evan', 'Lee', '+1-604-555-0105', FALSE, 1, NOW() - INTERVAL '55 days', NOW() - INTERVAL '18 days'),
      (106, 'fatima@example.test', 'Fatima', 'Hassan', '+1-403-555-0106', FALSE, 1, NOW() - INTERVAL '50 days', NOW() - INTERVAL '15 days'),
      (107, 'grace@example.test', 'Grace', 'Kim', '+1-212-555-0107', FALSE, 1, NOW() - INTERVAL '45 days', NOW() - INTERVAL '10 days'),
      (108, 'hiro@example.test', 'Hiro', 'Tanaka', '+1-310-555-0108', FALSE, 1, NOW() - INTERVAL '40 days', NOW() - INTERVAL '9 days'),
      (109, 'ivy@example.test', 'Ivy', 'Patel', '+1-206-555-0109', FALSE, 1, NOW() - INTERVAL '35 days', NOW() - INTERVAL '6 days'),
      (110, 'james@example.test', 'James', 'Wilson', '+1-305-555-0110', FALSE, 1, NOW() - INTERVAL '30 days', NOW() - INTERVAL '4 days')
  `)

  const addresses: SeedAddress[] = [
    { id: 501, customerId: 101, label: 'Home', line1: '120 King Street West', city: 'Toronto', regionId: 11, postalCode: 'M5H 1A1', countryCode: 'CA' },
    { id: 502, customerId: 101, label: 'Office', line1: '800 West Pender Street', city: 'Vancouver', regionId: 12, postalCode: 'V6C 2V6', countryCode: 'CA' },
    { id: 503, customerId: 102, label: 'Home', line1: '90 Elgin Street', city: 'Ottawa', regionId: 11, postalCode: 'K1P 5E1', countryCode: 'CA' },
    { id: 504, customerId: 103, label: 'Home', line1: '1250 René-Lévesque Blvd', city: 'Montreal', regionId: 14, postalCode: 'H3B 4W8', countryCode: 'CA' },
    { id: 505, customerId: 104, label: 'Home', line1: '40 Bay Street', city: 'Toronto', regionId: 11, postalCode: 'M5J 2X2', countryCode: 'CA' },
    { id: 506, customerId: 105, label: 'Home', line1: '999 Canada Place', city: 'Vancouver', regionId: 12, postalCode: 'V6C 3T4', countryCode: 'CA' },
    { id: 507, customerId: 106, label: 'Home', line1: '225 6 Avenue SW', city: 'Calgary', regionId: 13, postalCode: 'T2P 1N2', countryCode: 'CA' },
    { id: 508, customerId: 107, label: 'Office', line1: '350 Fifth Avenue', city: 'New York', regionId: 21, postalCode: '10118', countryCode: 'US' },
    { id: 509, customerId: 108, label: 'Home', line1: '6801 Hollywood Blvd', city: 'Los Angeles', regionId: 22, postalCode: '90028', countryCode: 'US' },
    { id: 510, customerId: 109, label: 'Home', line1: '400 Broad Street', city: 'Seattle', regionId: 23, postalCode: '98109', countryCode: 'US' },
    { id: 511, customerId: 110, label: 'Home', line1: '1 Ocean Drive', city: 'Miami', regionId: 24, postalCode: '33139', countryCode: 'US' },
  ]

  for (const address of addresses) {
    await client.query(
      `INSERT INTO customer_addresses
        (id, customer_id, label, line1, line2, city, region_id, postal_code, country_code, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW() - INTERVAL '20 days', NOW() - INTERVAL '20 days')`,
      [
        address.id,
        address.customerId,
        address.label,
        address.line1,
        address.line2 ?? null,
        address.city,
        address.regionId,
        address.postalCode,
        address.countryCode,
      ],
    )
  }

  await client.query(`
    INSERT INTO products (id, sku, name, description, price_cents, stock_qty, active, version, created_at, updated_at) VALUES
      (201, 'SKU-201', 'Laptop Pro 14', '14-inch business laptop', 129999, 8, TRUE, 1, NOW() - INTERVAL '100 days', NOW() - INTERVAL '5 days'),
      (202, 'SKU-202', 'Wireless Keyboard', 'Compact wireless keyboard', 7999, 25, TRUE, 1, NOW() - INTERVAL '100 days', NOW() - INTERVAL '5 days'),
      (203, 'SKU-203', 'USB-C Hub', '7-port USB-C hub', 4999, 40, TRUE, 1, NOW() - INTERVAL '100 days', NOW() - INTERVAL '5 days'),
      (204, 'SKU-204', 'Monitor 27"', '27-inch 1440p monitor', 34999, 12, TRUE, 1, NOW() - INTERVAL '100 days', NOW() - INTERVAL '5 days'),
      (205, 'SKU-205', 'Mechanical Keyboard', 'Hot-swap mechanical keyboard', 15999, 2, TRUE, 1, NOW() - INTERVAL '100 days', NOW() - INTERVAL '5 days'),
      (206, 'SKU-206', 'Webcam HD', '1080p conference webcam', 8999, 18, TRUE, 1, NOW() - INTERVAL '100 days', NOW() - INTERVAL '5 days'),
      (207, 'SKU-207', 'Desk Lamp', 'Adjustable LED desk lamp', 3999, 30, TRUE, 1, NOW() - INTERVAL '100 days', NOW() - INTERVAL '5 days'),
      (208, 'SKU-208', 'Standing Desk', 'Electric standing desk', 59999, 5, TRUE, 1, NOW() - INTERVAL '100 days', NOW() - INTERVAL '5 days'),
      (209, 'SKU-209', 'Office Chair', 'Ergonomic mesh chair', 24999, 10, TRUE, 1, NOW() - INTERVAL '100 days', NOW() - INTERVAL '5 days'),
      (210, 'SKU-210', 'Mouse Wireless', 'Silent wireless mouse', 2999, 0, TRUE, 1, NOW() - INTERVAL '100 days', NOW() - INTERVAL '5 days'),
      (211, 'SKU-211', 'HDMI Cable', '2m HDMI 2.1 cable', 1299, 100, TRUE, 1, NOW() - INTERVAL '100 days', NOW() - INTERVAL '5 days'),
      (212, 'SKU-212', 'Laptop Sleeve', '14-inch padded sleeve', 2499, 45, TRUE, 1, NOW() - INTERVAL '100 days', NOW() - INTERVAL '5 days'),
      (213, 'SKU-213', 'Legacy Docking Station', 'Discontinued USB dock', 9999, 20, FALSE, 1, NOW() - INTERVAL '100 days', NOW() - INTERVAL '40 days'),
      (214, 'SKU-214', 'Noise Cancelling Headphones', 'Over-ear ANC headphones', 19999, 7, TRUE, 1, NOW() - INTERVAL '100 days', NOW() - INTERVAL '5 days'),
      (215, 'SKU-215', 'Portable SSD 1TB', 'USB-C portable SSD', 11999, 15, TRUE, 1, NOW() - INTERVAL '100 days', NOW() - INTERVAL '5 days')
  `)

  const products = new Map<number, { sku: string; name: string; priceCents: number }>()
  const productRows = await client.query('SELECT id, sku, name, price_cents FROM products')
  for (const row of productRows.rows) {
    products.set(row.id, { sku: row.sku, name: row.name, priceCents: row.price_cents })
  }

  const addressRows = await client.query(`
    SELECT a.id, a.label, a.line1, a.line2, a.city, a.region_id, a.postal_code, a.country_code,
           r.code AS region_code, r.name AS region_name, c.name AS country_name
    FROM customer_addresses a
    JOIN regions r ON r.id = a.region_id
    JOIN countries c ON c.code = a.country_code
  `)
  const addressById = new Map<number, AddressSnapshot>()
  for (const row of addressRows.rows) {
    addressById.set(row.id, {
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
    })
  }

  const customerRows = await client.query('SELECT id, first_name, last_name, email FROM customers')
  const customerById = new Map<number, { name: string; email: string }>()
  for (const row of customerRows.rows) {
    customerById.set(row.id, { name: `${row.first_name} ${row.last_name}`, email: row.email })
  }

  async function insertOrder(params: {
    id: number
    customerId: number
    addressId: number
    items: SeedItem[]
    statusId: number
    paymentStatus: 'unpaid' | 'paid' | 'refunded'
    shippingMethodId: number
    daysAgo: number
    note?: string
  }): Promise<void> {
    const customer = customerById.get(params.customerId)
    const address = addressById.get(params.addressId)
    if (!customer || !address) {
      throw new Error(`Missing customer or address for order ${params.id}`)
    }

    const lineItems = params.items.map((item) => {
      const product = products.get(item.productId)
      if (!product) throw new Error(`Missing product ${item.productId}`)
      return {
        ...item,
        sku: product.sku,
        name: product.name,
        unitPriceCents: product.priceCents,
      }
    })
    const subtotalCents = lineItems.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0)
    const shipping = findShippingOption(address.countryCode, subtotalCents, params.shippingMethodId)
    if (!shipping) {
      throw new Error(`Invalid shipping method ${params.shippingMethodId} for order ${params.id}`)
    }
    const taxCents = calculateTaxCents(
      subtotalCents + shipping.priceCents,
      address.countryCode,
      address.regionCode,
    )
    const totalCents = subtotalCents + shipping.priceCents + taxCents
    const createdAtExpr = `NOW() - INTERVAL '${params.daysAgo} days'`

    await client.query(
      `INSERT INTO orders (
         id, order_number, customer_id, customer_name_snapshot, customer_email_snapshot,
         address_snapshot, status_id, payment_status, subtotal_cents, shipping_cents,
         tax_cents, total_cents, shipping_method_id, version, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, 1, ${createdAtExpr}, ${createdAtExpr}
       )`,
      [
        params.id,
        `ORD-2026-${params.id}`,
        params.customerId,
        customer.name,
        customer.email,
        JSON.stringify(address),
        params.statusId,
        params.paymentStatus,
        subtotalCents,
        shipping.priceCents,
        taxCents,
        totalCents,
        params.shippingMethodId,
      ],
    )

    for (const item of lineItems) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, sku_snapshot, name_snapshot, unit_price_cents, quantity)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [params.id, item.productId, item.sku, item.name, item.unitPriceCents, item.quantity],
      )
    }

    await client.query(
      `INSERT INTO order_activity (order_id, event_type, data, created_by, created_at)
       VALUES ($1, 'ORDER_CREATED', $2::jsonb, 1, ${createdAtExpr})`,
      [params.id, JSON.stringify({ totalCents, statusId: params.statusId })],
    )

    if (params.statusId !== ORDER_STATUS.DRAFT) {
      await client.query(
        `INSERT INTO order_activity (order_id, event_type, data, created_by, created_at)
         VALUES ($1, 'STATUS_CHANGED', $2::jsonb, 1, ${createdAtExpr} + INTERVAL '1 hour')`,
        [params.id, JSON.stringify({ fromStatusId: ORDER_STATUS.DRAFT, toStatusId: params.statusId })],
      )
    }

    if (params.note) {
      await client.query(
        `INSERT INTO order_notes (order_id, body, created_by, created_at)
         VALUES ($1, $2, 1, ${createdAtExpr} + INTERVAL '2 hours')`,
        [params.id, params.note],
      )
      await client.query(
        `INSERT INTO order_activity (order_id, event_type, data, created_by, created_at)
         VALUES ($1, 'NOTE_ADDED', $2::jsonb, 1, ${createdAtExpr} + INTERVAL '2 hours')`,
        [params.id, JSON.stringify({ body: params.note })],
      )
    }
  }

  await insertOrder({
    id: 1001,
    customerId: 101,
    addressId: 501,
    items: [{ productId: 202, quantity: 1 }, { productId: 203, quantity: 1 }],
    statusId: ORDER_STATUS.DRAFT,
    paymentStatus: 'unpaid',
    shippingMethodId: 1,
    daysAgo: 2,
    note: 'Waiting on customer confirmation',
  })
  await insertOrder({
    id: 1002,
    customerId: 101,
    addressId: 501,
    items: [{ productId: 201, quantity: 1 }, { productId: 212, quantity: 1 }],
    statusId: ORDER_STATUS.CONFIRMED,
    paymentStatus: 'paid',
    shippingMethodId: 1,
    daysAgo: 14,
  })
  await insertOrder({
    id: 1003,
    customerId: 101,
    addressId: 502,
    items: [{ productId: 204, quantity: 1 }],
    statusId: ORDER_STATUS.SHIPPED,
    paymentStatus: 'paid',
    shippingMethodId: 2,
    daysAgo: 21,
    note: 'Deliver to reception',
  })
  await insertOrder({
    id: 1004,
    customerId: 101,
    addressId: 501,
    items: [{ productId: 214, quantity: 1 }, { productId: 206, quantity: 1 }],
    statusId: ORDER_STATUS.PROCESSING,
    paymentStatus: 'paid',
    shippingMethodId: 1,
    daysAgo: 6,
  })
  await insertOrder({
    id: 1005,
    customerId: 103,
    addressId: 504,
    items: [{ productId: 209, quantity: 1 }],
    statusId: ORDER_STATUS.SHIPPED,
    paymentStatus: 'paid',
    shippingMethodId: 1,
    daysAgo: 18,
  })
  await insertOrder({
    id: 1006,
    customerId: 104,
    addressId: 505,
    items: [{ productId: 208, quantity: 1 }, { productId: 207, quantity: 1 }],
    statusId: ORDER_STATUS.CONFIRMED,
    paymentStatus: 'paid',
    shippingMethodId: 1,
    daysAgo: 9,
  })
  await insertOrder({
    id: 1007,
    customerId: 105,
    addressId: 506,
    items: [{ productId: 215, quantity: 2 }],
    statusId: ORDER_STATUS.PROCESSING,
    paymentStatus: 'paid',
    shippingMethodId: 2,
    daysAgo: 5,
  })
  await insertOrder({
    id: 1008,
    customerId: 106,
    addressId: 507,
    items: [{ productId: 204, quantity: 1 }, { productId: 211, quantity: 2 }],
    statusId: ORDER_STATUS.SHIPPED,
    paymentStatus: 'paid',
    shippingMethodId: 1,
    daysAgo: 16,
  })
  await insertOrder({
    id: 1009,
    customerId: 107,
    addressId: 508,
    items: [{ productId: 201, quantity: 1 }],
    statusId: ORDER_STATUS.CANCELLED,
    paymentStatus: 'refunded',
    shippingMethodId: 4,
    daysAgo: 11,
    note: 'Customer cancelled after delay',
  })
  await insertOrder({
    id: 1010,
    customerId: 108,
    addressId: 509,
    items: [{ productId: 202, quantity: 1 }, { productId: 210, quantity: 1 }],
    statusId: ORDER_STATUS.DRAFT,
    paymentStatus: 'unpaid',
    shippingMethodId: 3,
    daysAgo: 1,
  })
  await insertOrder({
    id: 1011,
    customerId: 109,
    addressId: 510,
    items: [{ productId: 205, quantity: 1 }],
    statusId: ORDER_STATUS.CONFIRMED,
    paymentStatus: 'paid',
    shippingMethodId: 3,
    daysAgo: 7,
  })
  await insertOrder({
    id: 1012,
    customerId: 110,
    addressId: 511,
    items: [{ productId: 214, quantity: 1 }, { productId: 212, quantity: 2 }],
    statusId: ORDER_STATUS.SHIPPED,
    paymentStatus: 'paid',
    shippingMethodId: 4,
    daysAgo: 19,
  })

  await client.query(`SELECT setval(pg_get_serial_sequence('staff_users', 'id'), 10)`)
  await client.query(`SELECT setval(pg_get_serial_sequence('customers', 'id'), 200)`)
  await client.query(`SELECT setval(pg_get_serial_sequence('customer_addresses', 'id'), 600)`)
  await client.query(`SELECT setval(pg_get_serial_sequence('regions', 'id'), 50)`)
  await client.query(`SELECT setval(pg_get_serial_sequence('products', 'id'), 300)`)
  await client.query(`SELECT setval(pg_get_serial_sequence('orders', 'id'), 2000)`)
  await client.query(`SELECT setval(pg_get_serial_sequence('order_items', 'id'), 4000)`)
  await client.query(`SELECT setval(pg_get_serial_sequence('order_notes', 'id'), 4000)`)
  await client.query(`SELECT setval(pg_get_serial_sequence('order_activity', 'id'), 4000)`)
}
