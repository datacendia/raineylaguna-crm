import { redirect } from 'next/navigation'

/**
 * Root of the CRM: there is no public home page — the CRM is staff-only.
 * Anyone landing here gets bounced into `/dashboard`, which the proxy gate
 * (src/proxy.ts) will redirect to `/login` if there's no valid session.
 *
 * Without this redirect the deployed CRM showed a near-empty placeholder
 * page that operators (correctly) read as "the app is broken". The
 * placeholder was a leftover from the project bootstrap.
 */
export default function Home() {
  redirect('/dashboard')
}
