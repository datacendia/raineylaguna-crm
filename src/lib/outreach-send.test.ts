import { describe, it, expect, vi } from 'vitest'

// sendOutreach checks the do-not-contact list before anything else, which needs
// a database. These tests are about the gates, not about suppression, so stand
// in a pool that reports "not suppressed" and let the real gate logic run.
// suppression.test.ts covers the list itself.
vi.mock('./db', () => ({
  default: { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) },
}))

import { whatsappAllowedForCity, sendOutreach } from './outreach-send'

describe('whatsappAllowedForCity — automated-WhatsApp compliance gate', () => {
  it('allows Lima (Peru)', () => {
    expect(whatsappAllowedForCity('Lima')).toBe(true)
  })

  it('blocks the non-Peru markets', () => {
    expect(whatsappAllowedForCity('Boston')).toBe(false)
    expect(whatsappAllowedForCity('Glasgow')).toBe(false)
    expect(whatsappAllowedForCity('Los Angeles')).toBe(false)
  })

  it('fails closed on unknown or missing city', () => {
    expect(whatsappAllowedForCity(undefined)).toBe(false)
    expect(whatsappAllowedForCity(null)).toBe(false)
    expect(whatsappAllowedForCity('Atlantis')).toBe(false)
  })
})

describe('sendOutreach — WhatsApp gate is enforced before any provider call', () => {
  it('gates a non-Peru WhatsApp send (never reaches Twilio)', async () => {
    const out = await sendOutreach({
      channel: 'WhatsApp',
      body: 'hola',
      phone: '+15551234567',
      city: 'Boston',
    })
    expect(out.status).toBe('pending')
    expect(out.status === 'pending' && out.reason).toContain('whatsapp_gated')
  })

  it('lets a Lima WhatsApp send through the gate', async () => {
    const out = await sendOutreach({
      channel: 'WhatsApp',
      body: 'hola',
      phone: '+51999888777',
      city: 'Lima',
    })
    // Passed the gate; in an env without Twilio creds it then stops at config —
    // the point is it is NOT gated.
    if (out.status !== 'sent') expect(out.reason).not.toContain('whatsapp_gated')
  })

  it('never gates Email by city', async () => {
    const out = await sendOutreach({
      channel: 'Email',
      body: 'hola',
      email: 'someone@example.com',
      city: 'Boston',
    })
    if (out.status !== 'sent') expect(out.reason).not.toContain('whatsapp_gated')
  })
})

describe('sendOutreach — manual-only markets never auto-send on any channel', () => {
  it('returns manual for Email in a manual-only market (even a permissive-email country)', async () => {
    const out = await sendOutreach({
      channel: 'Email',
      body: 'hola',
      email: 'owner@negocio.com.co',
      city: 'Bogotá',
    })
    expect(out.status).toBe('manual')
    expect(out.status === 'manual' && out.reason).toContain('manual_market:Bogotá')
  })

  it('returns manual for WhatsApp in a manual-only market', async () => {
    const out = await sendOutreach({
      channel: 'WhatsApp',
      body: 'hola',
      phone: '+541199998888',
      city: 'Buenos Aires',
    })
    expect(out.status).toBe('manual')
    expect(out.status === 'manual' && out.reason).toContain('manual_market:Buenos Aires')
  })
})

/**
 * Copy built on a site we never reached must not auto-send.
 *
 * The crawler cannot distinguish a bot block from an outage, so 1,498 leads
 * flagged `unreachable` would each have gone out claiming the prospect's
 * website was down. The gate routes them to the operator instead — the lead is
 * valid, it is the claim that is unverified.
 */
describe('sendOutreach — unverified unreachable sites are never auto-sent', () => {
  it('routes an unreachable lead to the operator on any channel', async () => {
    for (const channel of ['WhatsApp', 'Email']) {
      const out = await sendOutreach({
        channel,
        body: 'hola',
        phone: '+51999999999',
        email: 'a@b.com',
        city: 'Lima', // a market that WOULD otherwise auto-send
        auditStatus: 'unreachable',
      })
      expect(out.status, channel).toBe('manual')
      if (out.status !== 'manual') return
      expect(out.reason).toBe('unverified_unreachable_site')
    }
  })

  it('does not block a measured lead', async () => {
    const out = await sendOutreach({
      channel: 'Email',
      body: 'hola',
      email: 'a@b.com',
      city: 'Lima',
      auditStatus: 'measured',
    })
    expect(out.status === 'manual' && out.reason === 'unverified_unreachable_site').toBe(
      false,
    )
  })

  it('does not block when the status is unknown, so existing callers are unaffected', async () => {
    const out = await sendOutreach({
      channel: 'Email',
      body: 'hola',
      email: 'a@b.com',
      city: 'Lima',
    })
    expect(out.status === 'manual' && out.reason === 'unverified_unreachable_site').toBe(
      false,
    )
  })
})
