export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message)
  }

  toJSON(): Record<string, unknown> {
    return { code: this.code, message: this.message, ...this.extra }
  }
}

export function notFound(entity: string): ApiError {
  return new ApiError(404, 'NOT_FOUND', `${entity} not found`)
}

export function validationError(message: string, extra: Record<string, unknown> = {}): ApiError {
  return new ApiError(400, 'VALIDATION_ERROR', message, extra)
}

export function unauthenticated(): ApiError {
  return new ApiError(401, 'UNAUTHENTICATED', 'Authentication required')
}

export function csrfInvalid(): ApiError {
  return new ApiError(403, 'CSRF_TOKEN_INVALID', 'Invalid CSRF token')
}
