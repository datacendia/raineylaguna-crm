'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }
  return (
    <div className="flex min-h-screen">
      <aside className="w-64 bg-iron text-bone p-6 flex flex-col">
        <h2 className="text-2xl font-bold mb-8">Rainey Laguna CRM</h2>
        <nav className="space-y-4 flex-1">
          <Link href="/dashboard" className="block hover:text-vermilion">Dashboard</Link>
          <Link href="/dashboard/analytics" className="block hover:text-vermilion">Analytics</Link>
          <Link href="/dashboard/digest" className="block hover:text-vermilion">Monday digest</Link>
          <Link href="/dashboard/leads" className="block hover:text-vermilion">Leads</Link>
          <Link href="/dashboard/pipeline" className="block hover:text-vermilion">Pipeline</Link>
          <Link href="/dashboard/outreach" className="block hover:text-vermilion">Outreach</Link>
          <Link href="/dashboard/drafts" className="block hover:text-vermilion">Draft queue</Link>
          <Link href="/dashboard/video-audits" className="block hover:text-vermilion">Video Audits</Link>
          <Link href="/dashboard/batch" className="block hover:text-vermilion">Batch Outreach</Link>
          <Link href="/dashboard/security" className="block hover:text-vermilion">Security</Link>
          <Link href="/dashboard/guide" className="block hover:text-vermilion">Guide</Link>
        </nav>
        <button onClick={logout} className="text-left text-sm text-gray-400 hover:text-vermilion">
          Logout
        </button>
      </aside>
      <main className="flex-1">{children}</main>
    </div>
  )
}
