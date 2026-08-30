export const ORDER_STATUS_LABELS: Record<number, string> = {
  10: 'Draft',
  20: 'Confirmed',
  30: 'Processing',
  40: 'Shipped',
  50: 'Cancelled',
}

export const ORDER_STATUS = {
  DRAFT: 10,
  CONFIRMED: 20,
  PROCESSING: 30,
  SHIPPED: 40,
  CANCELLED: 50,
} as const

export type StatusAction = {
  label: string
  statusId: number
  danger?: boolean
}

export function statusActions(statusId: number): StatusAction[] {
  switch (statusId) {
    case ORDER_STATUS.DRAFT:
      return [
        { label: 'Confirm order', statusId: ORDER_STATUS.CONFIRMED },
        { label: 'Cancel order', statusId: ORDER_STATUS.CANCELLED, danger: true },
      ]
    case ORDER_STATUS.CONFIRMED:
      return [
        { label: 'Start processing', statusId: ORDER_STATUS.PROCESSING },
        { label: 'Cancel order', statusId: ORDER_STATUS.CANCELLED, danger: true },
      ]
    case ORDER_STATUS.PROCESSING:
      return [
        { label: 'Mark shipped', statusId: ORDER_STATUS.SHIPPED },
        { label: 'Cancel order', statusId: ORDER_STATUS.CANCELLED, danger: true },
      ]
    default:
      return []
  }
}

export function statusLabel(statusId: number): string {
  return ORDER_STATUS_LABELS[statusId] ?? `Status ${statusId}`
}
