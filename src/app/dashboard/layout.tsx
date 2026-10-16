import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardNav from '@/components/DashboardNav'
import styles from './layout.module.css'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth')

  return (
    <div className={styles.layout}>
      <DashboardNav user={user} />
      <main className={styles.main}>
        {children}
      </main>
    </div>
  )
}
