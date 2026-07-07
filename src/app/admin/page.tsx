import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import AdminDashboardClient from './AdminDashboardClient'

export const revalidate = 0 // Disable cache for real-time dashboard data

export default async function AdminPage() {
  const supabase = await createClient()

  // 1. Authenticate user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/')
  }

  // 2. Query profile role
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    redirect('/')
  }

  // Protect Admin Route
  if (profile.role !== 'Admin') {
    redirect('/dashboard')
  }

  // 3. Pre-fetch tasks and profiles
  // We fetch tasks with the assigned profile nested
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

  // We fetch all profiles representing team members
  const { data: profilesData } = await supabase
    .from('profiles')
    .select('*')
    .order('name')

  const tasks = tasksData || []
  const profiles = profilesData || []

  return (
    <AdminDashboardClient
      initialTasks={tasks as any}
      profiles={profiles}
      adminName={profile.name}
    />
  )
}
