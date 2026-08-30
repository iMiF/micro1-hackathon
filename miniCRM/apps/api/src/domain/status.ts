export const ORDER_STATUS = {
  DRAFT: 10,
  CONFIRMED: 20,
  PROCESSING: 30,
  SHIPPED: 40,
  CANCELLED: 50,
} as const

export type OrderStatusId = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS]

const ALLOWED_TRANSITIONS: Record<number, number[]> = {
  [ORDER_STATUS.DRAFT]: [ORDER_STATUS.CONFIRMED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.CONFIRMED]: [ORDER_STATUS.PROCESSING, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.PROCESSING]: [ORDER_STATUS.SHIPPED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.SHIPPED]: [],
  [ORDER_STATUS.CANCELLED]: [],
}

export function isAllowedTransition(fromStatusId: number, toStatusId: number): boolean {
  return (ALLOWED_TRANSITIONS[fromStatusId] ?? []).includes(toStatusId)
}

export function isKnownStatus(statusId: number): boolean {
  return Object.values(ORDER_STATUS).includes(statusId as OrderStatusId)
}
