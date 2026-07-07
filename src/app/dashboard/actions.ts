'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { createClient as createStaticSupabase } from '@supabase/supabase-js'

export async function updateTaskStatus(taskId: string, newStatus: 'Pending' | 'In Progress' | 'Done') {
  const supabase = await createClient()

  // 1. Get current authenticated user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Authentication required' }

  // 2. Fetch the task to verify assignment
  const { data: task, error: fetchError } = await supabase
    .from('tasks')
    .select('assigned_to')
    .eq('id', taskId)
    .single()

  if (fetchError || !task) {
    return { error: 'Task not found' }
  }

  // 3. Verify user profile role to see if they are Admin (Admins can override status)
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const isAssignedUser = task.assigned_to === user.id
  const isAdmin = profile?.role === 'Admin'

  if (!isAssignedUser && !isAdmin) {
    return { error: 'You are only authorized to update tasks assigned to you' }
  }

  // 4. Use service-role client to perform the status update, bypassing RLS constraints
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey) {
    return { error: 'SUPABASE_SERVICE_ROLE_KEY is not configured in .env.local' }
  }

  const adminClient = createStaticSupabase(supabaseUrl, serviceRoleKey)
  const { error: updateError } = await adminClient
    .from('tasks')
    .update({ status: newStatus })
    .eq('id', taskId)

  if (updateError) {
    return { error: updateError.message }
  }

  revalidatePath('/dashboard')
  revalidatePath('/admin')
  return { success: true }
}
