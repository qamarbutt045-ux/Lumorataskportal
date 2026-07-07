import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import DashboardClient from './DashboardClient'

export const revalidate = 0 // Disable cache for real-time dashboard data

export default async function DashboardPage() {
  const supabase = await createClient()

  // 1. Authenticate user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/')
  }

  // 2. Query profile info
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    redirect('/')
  }

  // 3. Pre-fetch all tasks (assigned and others)
  const { data: tasksData } = await supabase
    .from('tasks')
    .select(`
      id,
      title,
      description,
      assigned_to,
      deadline,
      status,
      created_at,
      profiles:assigned_to (
        id,
        name,
        email,
        phone,
        role
      )
    `)
    .order('created_at', { ascending: false })

  const tasks = tasksData || []

  return (
    <DashboardClient
      initialTasks={tasks as any}
      currentUserProfile={profile}
    />
  )
}
