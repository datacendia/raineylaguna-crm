import { describe, it, expect } from 'vitest'
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
