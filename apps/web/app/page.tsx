import { redirect } from 'next/navigation'
import { isAuthenticated } from '@/lib/server-auth'
import Dashboard from '@/components/Dashboard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function Page() {
  if (!(await isAuthenticated())) {
    redirect('/login')
  }
  return <Dashboard />
}
