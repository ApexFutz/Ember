import { toast as sonner } from 'sonner'

// Centralized toast helpers wrapping Sonner with Ember's intent variants.
// Use these everywhere instead of calling sonner directly so styling/behavior
// stays consistent (see <Toaster /> config in App.tsx).
//
// Convention: pass a plain-English, user-facing message. For errors, prefer
// extractMessage(err) to surface the underlying reason when there is one.

export function extractMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (!err) return fallback
  if (typeof err === 'string') return err
  if (err instanceof Error && err.message) return err.message
  // Supabase errors are plain objects with a `message` field.
  if (typeof err === 'object' && 'message' in err) {
    const m = (err as { message?: unknown }).message
    if (typeof m === 'string' && m) return m
  }
  return fallback
}

export const toast = {
  success(message: string, description?: string) {
    return sonner.success(message, { description })
  },
  error(message: string, description?: string) {
    return sonner.error(message, { description })
  },
  info(message: string, description?: string) {
    return sonner(message, { description })
  },
}

export default toast
