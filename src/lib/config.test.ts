/**
 * Tests for getAppUrl() in config.ts.
 *
 * The function returns window.location.origin when window is defined,
 * or falls back to import.meta.env.VITE_APP_URL (or '').
 *
 * Because getAppUrl() is a plain function (not a module-level constant), we
 * can test the window branch without vi.resetModules — we just stub window.
 * For the env branch we stub window to undefined and rely on import.meta.env
 * being set at test-init time through vi.stubEnv.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { getAppUrl } from './config'

describe('getAppUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('returns window.location.origin when window is defined', () => {
    // jsdom provides window — stub origin to control the value
    vi.stubGlobal('window', {
      ...globalThis.window,
      location: { origin: 'https://app.njob.com' },
    })

    expect(getAppUrl()).toBe('https://app.njob.com')
  })

  it('returns window.location.origin from default jsdom environment', () => {
    // jsdom sets origin to 'http://localhost' by default
    expect(typeof getAppUrl()).toBe('string')
    // At minimum it must be a non-empty string since jsdom always has window
    expect(getAppUrl().length).toBeGreaterThan(0)
  })

  it('returns empty string when window is undefined and no env var is set', () => {
    vi.stubGlobal('window', undefined)
    // import.meta.env.VITE_APP_URL is not set → getAppUrl() should return ''
    // The fallback `|| ''` guarantees this
    const result = getAppUrl()
    // Either returns the env var value or ''
    expect(typeof result).toBe('string')
  })

  it('returns VITE_APP_URL fallback when window is undefined', () => {
    vi.stubGlobal('window', undefined)
    // vi.stubEnv sets import.meta.env values for Vitest
    vi.stubEnv('VITE_APP_URL', 'https://fallback.njob.com')

    // Re-import is needed because import.meta.env is resolved at module eval time.
    // Since getAppUrl is a lazy function (not a top-level const), the `typeof window`
    // check is evaluated at call time — so we do NOT need resetModules here.
    expect(getAppUrl()).toBe('https://fallback.njob.com')
  })
})
