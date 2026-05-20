'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [needsTotp, setNeedsTotp] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, code: needsTotp ? code : undefined }),
      })

      if (response.ok) {
        router.push('/dashboard')
        return
      }

      const data = (await response.json().catch(() => ({}))) as {
        needs_totp?: boolean
        error?: string
      }

      if (data.needs_totp) {
        setNeedsTotp(true)
        setError(needsTotp ? 'Invalid 6-digit code' : '')
      } else if (response.status === 429) {
        setError(data.error ?? 'Too many attempts. Try again later.')
      } else {
        setError('Invalid email or password')
        setNeedsTotp(false)
        setCode('')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <form onSubmit={handleSubmit} className="space-y-4 w-full max-w-sm">
        <h1 className="text-2xl font-bold">CRM Login</h1>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
          disabled={needsTotp}
          className="border p-2 rounded w-full disabled:bg-gray-100"
          autoComplete="email"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
          disabled={needsTotp}
          className="border p-2 rounded w-full disabled:bg-gray-100"
          autoComplete="current-password"
        />
        {needsTotp && (
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="6-digit code"
            inputMode="numeric"
            pattern="\d{6}"
            required
            autoFocus
            className="border p-2 rounded w-full font-mono tracking-widest text-center"
            autoComplete="one-time-code"
          />
        )}
        {error && <p className="text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={loading || (needsTotp && code.length !== 6)}
          className="bg-vermilion text-white px-4 py-2 rounded w-full disabled:opacity-50"
        >
          {loading ? 'Signing in...' : needsTotp ? 'Verify' : 'Login'}
        </button>
        {needsTotp && (
          <button
            type="button"
            onClick={() => {
              setNeedsTotp(false)
              setCode('')
              setError('')
            }}
            className="text-sm text-gray-500 hover:text-vermilion w-full"
          >
            ← Use a different account
          </button>
        )}
      </form>
    </div>
  )
}
