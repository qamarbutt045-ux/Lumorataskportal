'use server'

import { createClient } from '@/utils/supabase/server'
import { createClient as createStaticSupabase } from '@supabase/supabase-js'

/**
 * Server action to fetch structured data for weekly/monthly reporting analytics
 */
export async function fetchReportsData(period: 'weekly' | 'monthly') {
  try {
    const supabase = await createClient()

    // 1. Verify user session
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Authentication required' }

    // 2. Verify admin privilege
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'Admin') {
      return { error: 'Only administrators can access report data.' }
    }

    // Determine date range (Pakistan Time)
    const today = new Date()
    let startDateStr = ''
    let endDateStr = today.toISOString().split('T')[0]
    let periodName = ''

    if (period === 'weekly') {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      startDateStr = sevenDaysAgo.toISOString().split('T')[0]
      periodName = `${sevenDaysAgo.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    } else {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
      startDateStr = startOfMonth.toISOString().split('T')[0]
      periodName = today.toLocaleString('en-US', { month: 'long', year: 'numeric' })
    }

    // 3. Initialize admin service client to query data
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const adminClient = createStaticSupabase(supabaseUrl, serviceRoleKey)

    const { data: profiles } = await adminClient
      .from('profiles')
      .select('id, name, phone, designation')
      .eq('role', 'Member')

    const { data: tasks } = await adminClient
      .from('tasks')
      .select('id, title, status, deadline, completed_at, duration_seconds, assigned_to')
      .gte('scheduled_date', startDateStr)
      .lte('scheduled_date', endDateStr)

    const { data: leaves } = await adminClient
      .from('performance_logs')
      .select('date, profile_id, is_leave')
      .eq('is_leave', true)
      .gte('date', startDateStr)
      .lte('date', endDateStr)

    if (!profiles || profiles.length === 0) {
      return { error: 'No employee profiles found in database.' }
    }

    const employeesReportList = profiles.map(p => {
      const empTasks = tasks?.filter(t => t.assigned_to === p.id) || []
      const empLeaves = leaves?.filter(l => l.profile_id === p.id) || []

      const totalAssigned = empTasks.length
      const totalCompleted = empTasks.filter(t => t.status === 'Done').length
      const leavesCount = empLeaves.length
      const completionRate = totalAssigned > 0 ? Math.round((totalCompleted / totalAssigned) * 100) : 100

      return {
        id: p.id,
        name: p.name,
        designation: p.designation || 'Team Representative',
        phone: p.phone,
        totalAssigned,
        totalCompleted,
        leavesCount,
        completionRate,
        tasks: empTasks.map(t => ({
          id: t.id,
          title: t.title,
          status: t.status,
          deadline: t.deadline,
          completed_at: t.completed_at,
          duration_seconds: t.duration_seconds
        })),
        leaves: empLeaves.map(l => ({ date: l.date }))
      }
    })

    return {
      success: true,
      periodName,
      employees: employeesReportList
    }

  } catch (err: any) {
    return { error: err.message || 'An error occurred while compiling report data.' }
  }
}

/**
 * Triggers the automated WhatsApp dispatch manually from the server
 */
export async function broadcastReportsViaWhatsApp(period: 'weekly' | 'monthly') {
  try {
    const supabase = await createClient()

    // 1. Verify user session
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Authentication required' }

    // 2. Verify admin privilege
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'Admin') {
      return { error: 'Only administrators can broadcast reports.' }
    }

    const endpoint = period === 'weekly' ? 'weekly-report' : 'monthly-report'
    
    // We invoke the API route using fetch. 
    // If CRON_SECRET is configured, we pass it, otherwise the handler will execute anyway.
    const cronSecret = process.env.CRON_SECRET
    const headers: Record<string, string> = {}
    if (cronSecret) {
      headers['Authorization'] = `Bearer ${cronSecret}`
    }

    // Construct origin URL using absolute paths
    const origin = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const res = await fetch(`${origin}/api/cron/${endpoint}`, {
      method: 'GET',
      headers
    })

    const result = await res.json()
    if (!res.ok || !result.success) {
      return { error: result.error || 'Failed to trigger cron dispatch.' }
    }

    return { success: true, message: result.message }

  } catch (err: any) {
    return { error: err.message || 'An error occurred during WhatsApp broadcast.' }
  }
}
