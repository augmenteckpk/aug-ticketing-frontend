import { toast as sonner, type ExternalToast } from 'sonner'
import { ApiError } from '../api/client'

const defaultOptions: ExternalToast = {
  duration: 4500,
}

function messageFromUnknown(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.message
  if (e instanceof Error) return e.message
  if (typeof e === 'string' && e.trim()) return e
  return fallback
}

export function toastSuccess(message: string, options?: ExternalToast) {
  sonner.success(message, { ...defaultOptions, ...options })
}

export function toastError(e: unknown, fallback = 'Something went wrong', options?: ExternalToast) {
  sonner.error(messageFromUnknown(e, fallback), { ...defaultOptions, ...options })
}

export function toastInfo(message: string, options?: ExternalToast) {
  sonner.message(message, { ...defaultOptions, ...options })
}

export function toastWarning(message: string, options?: ExternalToast) {
  sonner.warning(message, { ...defaultOptions, ...options })
}

/** Re-export for promise / loading toasts in specific flows. */
export const toast = sonner
