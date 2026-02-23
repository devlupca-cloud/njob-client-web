import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

/**
 * In-memory lock that serializes execution per lock name.
 * Replaces navigator.locks (which can hang on background tabs)
 * while still preventing concurrent token refresh race conditions.
 *
 * Includes a timeout: if the previous holder hangs, the next
 * caller proceeds after `acquireTimeout` ms (prevents deadlock).
 */
const lockChain = new Map<string, Promise<unknown>>()

async function inMemoryLock<R>(
  name: string,
  acquireTimeout: number,
  fn: () => Promise<R>,
): Promise<R> {
  const prev = lockChain.get(name)

  if (prev) {
    // Wait for previous lock or timeout (whichever comes first)
    await Promise.race([
      prev.catch(() => {}),
      new Promise<void>((r) => setTimeout(r, acquireTimeout || 5000)),
    ])
  }

  const next = fn()
  lockChain.set(name, next)
  try {
    return await next
  } finally {
    if (lockChain.get(name) === next) {
      lockChain.delete(name)
    }
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    flowType: 'implicit',
    lock: inMemoryLock,
  },
})
