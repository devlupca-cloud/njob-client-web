import { useAuthStore } from '@/store/authStore'

/**
 * Returns true only when auth initialization is complete.
 * Use this to guard queries that depend on userId to prevent
 * showing empty states before auth is resolved.
 */
export function useAuthReady() {
  const isLoading = useAuthStore((s) => s.isLoading)
  return !isLoading
}
