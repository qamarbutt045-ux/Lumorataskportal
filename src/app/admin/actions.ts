'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { createClient as createStaticSupabase } from '@supabase/supabase-js'

export async function createTask(formData: FormData) {
  const title = formData.get('title') as string
  const description = formData.get('description') as string
  const assigned_to = formData.get('assigned_to') as string
  const deadlineStr = formData.get('deadline') as string
  const next_task_id = formData.get('next_task_id') as string || null

  if (!title || !assigned_to || !deadlineStr) {
    return { error: 'Title, Assignee, and Deadline are required fields' }
  }

  const supabase = await createClient()

  // 1. Verify user session
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // 2. Query profile role to verify they are an Admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'Admin') {
    return { error: 'Only administrators can create tasks' }
  }

  // 3. Use service-role client to perform the write, bypassing RLS issues
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey) {
    return { error: 'SUPABASE_SERVICE_ROLE_KEY is not configured in .env.local' }
  }

  const adminClient = createStaticSupabase(supabaseUrl, serviceRoleKey)
  const deadline = new Date(deadlineStr).toISOString()

  const { data, error } = await adminClient
    .from('tasks')
    .insert({
      title,
      description: description || null,
      assigned_to: assigned_to === 'unassigned' ? null : assigned_to,
      deadline,
      status: 'Pending',
      next_task_id: next_task_id || null,
      is_active: true
    })
    .select()

  if (error) {
    return { error: error.message }
  }

  // If a successor task is linked, update it to lock it (is_active = false)
  if (next_task_id && data && data[0]) {
    await adminClient
      .from('tasks')
      .update({ is_active: false })
      .eq('id', next_task_id)
  }



  // 4. Outgoing WhatsApp notification
  if (assigned_to !== 'unassigned') {
    const { data: assigneeProfile } = await adminClient
      .from('profiles')
      .select('name, phone')
      .eq('id', assigned_to)
      .single()

    if (assigneeProfile?.phone) {
      try {
        const { sendWhatsAppMessage } = await import('@/utils/whatsapp')
        const message = `*LUMORA COMMAND:*\n\nNew task assigned: "${title}"\n*Task Code: ${data[0].id}*\n📋 *Description:* ${description || 'No description provided'}\n📅 *Deadline:* ${new Date(deadlineStr).toLocaleString()}\n\nReply with *${data[0].id} DONE* to instantly mark this task as complete.`
        await sendWhatsAppMessage(assigneeProfile.phone, message)

        // Send monitoring copy to Admin
        const adminPhone = process.env.ADMIN_WHATSAPP_NUMBER
        if (adminPhone) {
          const adminMessage = `*LUMORA MONITORING ALERT:*\n\nTask Assigned to *${assigneeProfile.name}* (${assigneeProfile.phone}):\n\nTask: "${title}"\n*Task Code: ${data[0].id}*\n*Deadline:* ${new Date(deadlineStr).toLocaleString()}`
          await sendWhatsAppMessage(adminPhone, adminMessage)
        }
      } catch (err) {
        console.error('[WhatsApp Outgoing] Failed to send assignment notification:', err)
      }
    }
  }

  revalidatePath('/admin')
  return { success: true, task: data[0] }
}

export async function deleteTask(taskId: string) {
  const supabase = await createClient()

  // 1. Verify user session
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // 2. Query profile role to verify they are an Admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'Admin') {
    return { error: 'Only administrators can delete tasks' }
  }

  // 3. Use service-role client to delete
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey) {
    return { error: 'SUPABASE_SERVICE_ROLE_KEY is not configured in .env.local' }
  }

  const adminClient = createStaticSupabase(supabaseUrl, serviceRoleKey)
  const { error } = await adminClient
    .from('tasks')
    .delete()
    .eq('id', taskId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/admin')
  return { success: true }
}

export async function createTeamMember(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const name = formData.get('name') as string
  const phone = formData.get('phone') as string
  const role = formData.get('role') as string
  const designation = formData.get('designation') as string

  if (!email || !password || !name || !phone || !role || !designation) {
    return { error: 'All fields are required to register a team member' }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey) {
    return { error: 'SUPABASE_SERVICE_ROLE_KEY is not configured in .env.local' }
  }

  // Initialize service-role admin client to bypass verification email queues
  const adminClient = createStaticSupabase(supabaseUrl, serviceRoleKey)

  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password,
    phone,
    email_confirm: true,
    phone_confirm: true,
    user_metadata: {
      name,
      phone,
      role,
      designation
    },
  })

  if (authError) {
    return { error: authError.message }
  }

  revalidatePath('/admin')
  return { success: true }
}
