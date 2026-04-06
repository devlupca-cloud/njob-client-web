import { describe, it, expect } from 'vitest'
import { cn, formatCurrency, formatRelativeTime } from './utils'

describe('cn', () => {
  it('should merge Tailwind classes', () => {
    const result = cn('px-2 py-1', 'px-4')
    expect(result).toContain('px-4')
    expect(result).toContain('py-1')
    expect(result).not.toContain('px-2')
  })

  it('should handle conditional classes', () => {
    expect(cn('base', false && 'hidden', 'extra')).toBe('base extra')
  })
})

describe('formatCurrency', () => {
  it('should format BRL by default', () => {
    const result = formatCurrency(29.90)
    expect(result).toContain('29,90')
    expect(result).toContain('R$')
  })

  it('should handle zero', () => {
    const result = formatCurrency(0)
    expect(result).toContain('0,00')
  })

  it('should handle large numbers', () => {
    const result = formatCurrency(1500.50)
    expect(result).toContain('1.500,50')
  })
})

describe('formatRelativeTime', () => {
  it('should return "agora" for very recent dates', () => {
    expect(formatRelativeTime(new Date())).toBe('agora')
  })

  it('should return minutes for < 1 hour', () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60000)
    expect(formatRelativeTime(thirtyMinAgo)).toBe('30m')
  })

  it('should return hours for < 24 hours', () => {
    const fiveHoursAgo = new Date(Date.now() - 5 * 3600000)
    expect(formatRelativeTime(fiveHoursAgo)).toBe('5h')
  })

  it('should return days for >= 24 hours', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000)
    expect(formatRelativeTime(threeDaysAgo)).toBe('3d')
  })
})
