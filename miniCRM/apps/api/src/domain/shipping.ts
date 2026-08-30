export type ShippingOption = {
  methodId: number
  name: string
  priceCents: number
  estimatedDays: [number, number]
}

export function shippingOptionsFor(
  countryCode: string,
  subtotalCents: number,
): ShippingOption[] {
  if (countryCode === 'CA') {
    const standardPrice = subtotalCents >= 10000 ? 0 : 799
    return [
      { methodId: 1, name: 'Standard', priceCents: standardPrice, estimatedDays: [3, 5] },
      { methodId: 2, name: 'Express', priceCents: 1599, estimatedDays: [1, 2] },
    ]
  }
  if (countryCode === 'US') {
    return [
      { methodId: 3, name: 'Ground', priceCents: 899, estimatedDays: [5, 7] },
      { methodId: 4, name: 'Express', priceCents: 1899, estimatedDays: [2, 3] },
    ]
  }
  return [{ methodId: 5, name: 'International', priceCents: 2499, estimatedDays: [7, 14] }]
}

export function findShippingOption(
  countryCode: string,
  subtotalCents: number,
  methodId: number,
): ShippingOption | undefined {
  return shippingOptionsFor(countryCode, subtotalCents).find((option) => option.methodId === methodId)
}
