import { describe, it, expect } from 'vitest'
import { isOptOut, normalizeEmail, normalizePhone } from './suppression'

describe('isOptOut', () => {
  it('recognises the Spanish keywords a Peruvian recipient would actually send', () => {
    for (const s of ['BAJA', 'baja', 'Baja.', 'ALTO', 'cancelar', 'CANCELA', 'salir', 'eliminar', 'desuscribir']) {
      expect(isOptOut(s), s).toBe(true)
    }
  })

  it('recognises the English keywords WhatsApp and mail clients suggest', () => {
    for (const s of ['STOP', 'stop', 'Stop!', 'unsubscribe', 'REMOVE', 'quit', 'end']) {
      expect(isOptOut(s), s).toBe(true)
    }
  })

  it('handles accents and polite phrasing', () => {
    expect(isOptOut('cancelá')).toBe(true)
    expect(isOptOut('por favor baja')).toBe(true)
    expect(isOptOut('stop por favor')).toBe(true)
    expect(isOptOut('  BAJA  ')).toBe(true)
  })

  it('recognises multi-word Spanish opt-outs', () => {
    expect(isOptOut('no contactar')).toBe(true)
    expect(isOptOut('no molestar')).toBe(true)
  })

  // The expensive mistake is the FALSE POSITIVE: silencing a live prospect who
  // was actually engaging. Matching is therefore whole-message only.
  it('does not treat a keyword inside a sentence as an opt-out', () => {
    for (const s of [
      'no me gusta el stop motion',
      '¿me puedes dar de baja el precio?',
      'quiero cancelar mi contrato con el proveedor actual',
      'end of month works for me',
      'Hola, me interesa. ¿Cuánto cuesta?',
      'stop by the office tomorrow',
    ]) {
      expect(isOptOut(s), s).toBe(false)
    }
  })

  it('is safe on empty and nullish input', () => {
    expect(isOptOut('')).toBe(false)
    expect(isOptOut(null)).toBe(false)
    expect(isOptOut(undefined)).toBe(false)
    expect(isOptOut('   ')).toBe(false)
    expect(isOptOut('...')).toBe(false)
  })
})

describe('normalisation matches how crm_leads stores contacts', () => {
  it('lowercases and trims email', () => {
    expect(normalizeEmail('  Hola@RaineyLaguna.COM ')).toBe('hola@raineylaguna.com')
    expect(normalizeEmail('')).toBeNull()
    expect(normalizeEmail(null)).toBeNull()
  })

  // api/leads/public/route.ts stores phone as String(phone).replace(/\D/g,''),
  // so a suppression written from a webhook must reduce the same way or it will
  // never match the lead it came from.
  it('reduces phone to digits, so every spelling collapses to one key', () => {
    expect(normalizePhone('+51 987 654 321')).toBe('51987654321')
    expect(normalizePhone('whatsapp:+51987654321'.replace(/^whatsapp:/, ''))).toBe('51987654321')
    expect(normalizePhone('(01) 445-6789')).toBe('014456789')
    expect(normalizePhone('')).toBeNull()
    expect(normalizePhone('abc')).toBeNull()
  })
})

// The email path has a wrinkle WhatsApp doesn't: a real reply carries the whole
// quoted thread underneath. isOptOut matches whole messages only, so without
// trimming the quote a genuine "BAJA" reply would never be detected. This
// mirrors topOfReply() in api/webhooks/inbound-email/route.ts.
function topOfReply(text: string): string {
  const lines = text.split(/\r?\n/)
  const out: string[] = []
  for (const line of lines) {
    const l = line.trim()
    if (l.startsWith('>')) break
    if (/^-{2,}\s*(original message|mensaje original)/i.test(l)) break
    if (/^_{5,}$/.test(l)) break
    if (/^(on|el)\b.*\b(wrote|escribió|escribio):$/i.test(l)) break
    if (/^de:\s|^from:\s/i.test(l) && out.length > 0) break
    out.push(line)
  }
  return out.join('\n').trim()
}

describe('email replies: opt-out survives the quoted thread', () => {
  it('detects an opt-out above a quoted original', () => {
    const body = [
      'BAJA',
      '',
      'On 24 Jul 2026, Rainey Laguna <hola@raineylaguna.com> wrote:',
      '> Hola, vi que su sitio no tiene certificado SSL...',
      '> Un saludo',
    ].join('\n')
    expect(isOptOut(topOfReply(body))).toBe(true)
  })

  it('detects it above a Spanish attribution line', () => {
    const body = 'cancelar\n\nEl 24 jul 2026, Rainey Laguna escribió:\n> texto original'
    expect(isOptOut(topOfReply(body))).toBe(true)
  })

  it('detects it above an Outlook divider', () => {
    const body = 'unsubscribe\n\n-----Original Message-----\nFrom: Rainey Laguna\nSubject: hola'
    expect(isOptOut(topOfReply(body))).toBe(true)
  })

  it('does NOT fire when only the quoted thread contains the word', () => {
    const body = [
      'Gracias, me interesa. ¿Cuánto costaría?',
      '',
      'On 24 Jul 2026, Rainey Laguna wrote:',
      '> Responda BAJA para no recibir más correos.',
    ].join('\n')
    expect(isOptOut(topOfReply(body))).toBe(false)
  })

  it('leaves an unquoted genuine reply intact', () => {
    const body = 'Hola, me interesa. ¿Cuánto cuesta?'
    expect(topOfReply(body)).toBe(body)
    expect(isOptOut(topOfReply(body))).toBe(false)
  })
})
