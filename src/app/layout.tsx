import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "CRM | Rainey Laguna",
  description: "Lead management for Rainey Laguna Studios",
}

/**
 * The CSP nonce minted per request in src/proxy.ts can only be stamped onto
 * Next's inline scripts while a page is being rendered. A prerendered page is
 * served straight from build output, so it would ship un-nonced scripts under
 * a nonce-bearing policy and never hydrate — which is how /login came to be
 * dead HTML. Rendering on demand is what makes the nonce reachable.
 *
 * Nothing here is worth prerendering anyway: every route below this layout is
 * behind the session gate and renders operator-specific data.
 */
export const dynamic = 'force-dynamic'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
