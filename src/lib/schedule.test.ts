import { describe, it, expect } from 'vitest'
import {
  clampToBusinessWindow,
  businessHourSlot,
  isWithinBusinessWindow,
} from './schedule'

// Helpers: Lima is UTC-5, so 09:00 Lima === 14:00 UTC, 18:00 Lima === 23:00 UTC.
const utc = (iso: string) => new Date(iso)

describe('clampToBusinessWindow', () => {
  it('pushes a pre-09:00 Lima time forward to 09:00 the same day', () => {
    // 06:00 Lima = 11:00 UTC
    const out = clampToBusinessWindow(utc('2026-06-02T11:00:00Z'))
    expect(out.toISOString()).toBe('2026-06-02T14:00:00.000Z') // 09:00 Lima
  })

  it('pushes an at/after-18:00 Lima time to 09:00 next day', () => {
    // 23:47 Lima = 04:47 UTC next day
    const out = clampToBusinessWindow(utc('2026-06-03T04:47:00Z'))
    // That instant is 23:47 Lima on 2026-06-02 → next Lima day 09:00 = 2026-06-03 14:00 UTC
    expect(out.toISOString()).toBe('2026-06-03T14:00:00.000Z')
  })

  it('leaves an in-window time unchanged', () => {
    // 12:00 Lima = 17:00 UTC
    const d = utc('2026-06-02T17:00:00Z')
    expect(clampToBusinessWindow(d).toISOString()).toBe(d.toISOString())
  })
})

describe('isWithinBusinessWindow', () => {
  it('is true at noon Lima and false at midnight Lima', () => {
    expect(isWithinBusinessWindow(utc('2026-06-02T17:00:00Z'))).toBe(true) // 12:00 Lima
    expect(isWithinBusinessWindow(utc('2026-06-02T05:00:00Z'))).toBe(false) // 00:00 Lima
  })
})

describe('businessHourSlot', () => {
  it('keeps every slot inside business hours even from a late-night base', () => {
    const base = utc('2026-06-03T04:47:00Z') // 23:47 Lima 2026-06-02
    for (let i = 0; i < 60; i++) {
      const slot = businessHourSlot(base, i, 20)
      expect(isWithinBusinessWindow(slot)).toBe(true)
    }
  })

  it('spreads a day of sends across the window and rolls to later days', () => {
    const base = utc('2026-06-02T14:00:00Z') // 09:00 Lima
    const first = businessHourSlot(base, 0, 20)
    const second = businessHourSlot(base, 1, 20)
    const nextDay = businessHourSlot(base, 20, 20) // first slot of day 2
    expect(second.getTime()).toBeGreaterThan(first.getTime())
    expect(nextDay.getTime()).toBeGreaterThan(first.getTime() + 12 * 60 * 60 * 1000)
    expect(isWithinBusinessWindow(nextDay)).toBe(true)
  })

  it('never schedules earlier than the base instant', () => {
    const base = utc('2026-06-02T17:30:00Z') // 12:30 Lima
    const slot = businessHourSlot(base, 0, 20)
    expect(slot.getTime()).toBeGreaterThanOrEqual(base.getTime())
  })
})
