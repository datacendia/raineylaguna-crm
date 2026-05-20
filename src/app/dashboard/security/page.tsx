'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'

type Status = 'loading' | 'enabled' | 'disabled' | 'enrolling'

interface SetupResponse {
  secret: string
  qrDataUrl: string
  otpauthUri: string
}

export default function SecurityPage() {
  const [status, setStatus] = useState<Status>('loading')
  const [setup, setSetup] = useState<SetupResponse | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Fetch current TOTP enrolment state on mount.
  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/me', { method: 'GET' })
      .then(async (r) => {
        if (cancelled) return
        if (!r.ok) {
          setStatus('disabled')
          return
        }
        const data = (await r.json()) as { totp_enrolled_at: string | null }
        setStatus(data.totp_enrolled_at ? 'enabled' : 'disabled')
      })
      .catch(() => {
        if (!cancelled) setStatus('disabled')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const startEnrolment = async () => {
    setError('')
    setBusy(true)
    try {
      const r = await fetch('/api/auth/totp/setup', { method: 'POST' })
      if (!r.ok) {
        setError('Could not start TOTP enrolment.')
        return
      }
      setSetup((await r.json()) as SetupResponse)
      setStatus('enrolling')
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  const confirmCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const r = await fetch('/api/auth/totp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      if (r.ok) {
        setStatus('enabled')
        setSetup(null)
        setCode('')
        return
      }
      const data = (await r.json().catch(() => ({}))) as { error?: string; message?: string }
      if (r.status === 429) {
        setError(data.message ?? 'Too many failed attempts. Start over.')
        setStatus('disabled')
        setSetup(null)
        setCode('')
      } else {
        setError('Invalid code. Try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  const disable = async () => {
    if (!confirm('Disable TOTP? You will be able to log in with just your password.')) return
    setBusy(true)
    try {
      await fetch('/api/auth/totp/verify', { method: 'DELETE' })
      setStatus('disabled')
      setSetup(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Security</h1>

      <section className="border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-2">Two-factor authentication (TOTP)</h2>
        <p className="text-sm text-gray-600 mb-4">
          Pair an authenticator app (1Password, Authy, Google Authenticator) with your CRM
          account. Once enabled, every login requires the 6-digit rolling code from your app.
        </p>

        {status === 'loading' && <p className="text-sm text-gray-500">Loading…</p>}

        {status === 'disabled' && (
          <button
            onClick={startEnrolment}
            disabled={busy}
            className="bg-vermilion text-white px-4 py-2 rounded disabled:opacity-50"
          >
            Enable TOTP
          </button>
        )}

        {status === 'enrolling' && setup && (
          <form onSubmit={confirmCode} className="space-y-4">
            <ol className="list-decimal pl-5 text-sm space-y-2">
              <li>Open your authenticator app and scan this QR code.</li>
              <li>
                Or paste this secret manually:{' '}
                <code className="bg-gray-100 px-2 py-1 rounded font-mono">{setup.secret}</code>
              </li>
              <li>Enter the 6-digit code your app displays.</li>
            </ol>
            <div className="bg-white border rounded p-4 inline-block">
              <Image
                src={setup.qrDataUrl}
                alt="Scan with your authenticator app"
                width={220}
                height={220}
                unoptimized
              />
            </div>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6-digit code"
              inputMode="numeric"
              pattern="\d{6}"
              autoFocus
              className="border p-2 rounded w-full max-w-xs font-mono tracking-widest text-center"
              autoComplete="one-time-code"
            />
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy || code.length !== 6}
                className="bg-vermilion text-white px-4 py-2 rounded disabled:opacity-50"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => {
                  setSetup(null)
                  setStatus('disabled')
                  setCode('')
                  setError('')
                }}
                className="text-gray-500 hover:text-vermilion px-4 py-2"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {status === 'enabled' && (
          <div className="space-y-3">
            <p className="text-sm text-green-700">✓ TOTP is enabled on your account.</p>
            <button
              onClick={disable}
              disabled={busy}
              className="text-sm text-red-600 hover:underline disabled:opacity-50"
            >
              Disable TOTP
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
