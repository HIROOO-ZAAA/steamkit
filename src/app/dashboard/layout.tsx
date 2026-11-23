import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardNav from '@/components/dashboard/DashboardNav'
import OfflineNotice from '@/components/dashboard/OfflineNotice'
import './dashboard-theme.css'
import styles from './layout.module.css'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth')

  return (
    <div className={`dashboard-shell ${styles.layout}`}>
      <a className={styles.skipLink} href="#dashboard-main">
        Skip to dashboard content
      </a>
      <DashboardNav user={user} />
      <main id="dashboard-main" className={styles.main} tabIndex={-1}>
        <OfflineNotice />
        {children}
      </main>
    </div>
  )
}