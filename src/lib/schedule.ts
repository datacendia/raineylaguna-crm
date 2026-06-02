/**
 * Outreach send-time hygiene (ROADMAP #12).
 *
 * Cold outreach sent at 23:47 looks desperate (and hurts WhatsApp quality
 * ratings). Every scheduled send is clamped into Lima business hours,
 * 09:00–18:00, and a batch is spread evenly across that window.
 *
 * Peru does not observe DST, so America/Lima is a fixed UTC-5 — we can do the
 * civil-time math with a constant offset and avoid pulling in a tz library.
 *
 * Pure + deterministic (takes the "now" base as an argument) so it's unit-tested.
 */

/** Lima is a fixed UTC-5. */
const LIMA_OFFSET_MIN = 5 * 60
export const WINDOW_START_HOUR = 9 // 09:00 Lima
export const WINDOW_END_HOUR = 18 // 18:00 Lima

type LimaParts = { y: number; m: number; d: number; h: number; min: number }

/** Civil (Lima) calendar parts for an instant. */
function limaParts(d: Date): LimaParts {
  const shifted = new Date(d.getTime() - LIMA_OFFSET_MIN * 60 * 1000)
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth(),
    d: shifted.getUTCDate(),
    h: shifted.getUTCHours(),
    min: shifted.getUTCMinutes(),
  }
}

/** UTC instant for a given Lima civil time. Lima hour + 5 = UTC hour. */
function limaToUtc(y: number, m: number, d: number, h: number, min: number): Date {
  return new Date(Date.UTC(y, m, d, h + 5, min))
}

/**
 * Move an instant to the nearest valid Lima business-hours instant:
 *   - before 09:00 → 09:00 same Lima day
 *   - at/after 18:00 → 09:00 next Lima day
 *   - otherwise unchanged
 */
export function clampToBusinessWindow(d: Date): Date {
  const p = limaParts(d)
  if (p.h < WINDOW_START_HOUR) return limaToUtc(p.y, p.m, p.d, WINDOW_START_HOUR, 0)
  if (p.h >= WINDOW_END_HOUR) return limaToUtc(p.y, p.m, p.d + 1, WINDOW_START_HOUR, 0)
  return d
}

/**
 * Send-slot for the i-th message in a batch.
 *
 * Day = floor(index / perDay); within a day the messages are spaced evenly
 * across the 9-hour window. The slot is never earlier than `base`, and is
 * always clamped into business hours.
 */
export function businessHourSlot(base: Date, index: number, perDay: number): Date {
  const safePerDay = Math.max(1, perDay)
  const dayOffset = Math.floor(index / safePerDay)
  const slot = index % safePerDay
  const windowMin = (WINDOW_END_HOUR - WINDOW_START_HOUR) * 60
  const gapMin = Math.max(1, Math.floor(windowMin / safePerDay))
  const p = limaParts(base)
  let target = limaToUtc(p.y, p.m, p.d + dayOffset, WINDOW_START_HOUR, slot * gapMin)
  if (target.getTime() < base.getTime()) target = base
  return clampToBusinessWindow(target)
}

/** True when an instant falls inside the Lima business-hours window. */
export function isWithinBusinessWindow(d: Date): boolean {
  const p = limaParts(d)
  return p.h >= WINDOW_START_HOUR && p.h < WINDOW_END_HOUR
}
