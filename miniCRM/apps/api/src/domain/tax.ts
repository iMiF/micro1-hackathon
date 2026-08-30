export function taxRateFor(countryCode: string, regionCode: string): number {
  if (countryCode !== 'CA') {
    return 0
  }
  if (regionCode === 'ON') return 0.13
  if (regionCode === 'BC') return 0.12
  if (regionCode === 'AB') return 0.05
  return 0.05
}

export function calculateTaxCents(
  netCents: number,
  countryCode: string,
  regionCode: string,
): number {
  return Math.round(netCents * taxRateFor(countryCode, regionCode))
}
