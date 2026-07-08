import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, serviceRoleKey)

export async function GET(request: NextRequest) {
  try {
    // 1. Verify cron security authorization token if configured
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Resolve today and tomorrow date strings in Pakistan Time (Asia/Karachi)
    const todayDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Karachi' }))
    const todayDateStr = todayDate.toLocaleDateString('en-CA')
    
    const tomorrowDate = new Date(todayDate)
    tomorrowDate.setDate(todayDate.getDate() + 1)
    const tomorrowDateStr = tomorrowDate.toLocaleDateString('en-CA')

    console.log(`[Cron End-of-Day] Running check for date: ${todayDateStr}. Rollover target: ${tomorrowDateStr}`)

    // 3. Fetch all tasks scheduled for today that are NOT Done
    const { data: incompleteTasks, error: fetchError } = await supabase
      .from('tasks')
      .select(`
        id,
        title,
        assigned_to,
        rollover_count,
        profiles:assigned_to (
          id,
          name
        )
      `)
      .eq('scheduled_date', todayDateStr)
      .neq('status', 'Done')

    if (fetchError) throw fetchError

    if (!incompleteTasks || incompleteTasks.length === 0) {
      return Response.json({ success: true, message: 'All scheduled tasks completed successfully today!' })
    }

    // 4. Process performance logs & update tasks
    const rolledOverItems: string[] = []
    const profileLeaves = new Set<string>()

    for (const task of incompleteTasks) {
      if (!task.assigned_to) continue
      profileLeaves.add(task.assigned_to)

      // Fetch task details for report
      const profile = task.profiles as any
      rolledOverItems.push(`- *${profile?.name || 'Member'}*: Code ${task.id} ("${task.title}")`)

      // Increment rollover count and push date to tomorrow
      const nextRolloverCount = (task.rollover_count || 0) + 1
      const { error: updateError } = await supabase
        .from('tasks')
        .update({
          scheduled_date: tomorrowDateStr,
          rollover_count: nextRolloverCount
        })
        .eq('id', task.id)

      if (updateError) {
        console.error(`[Cron Rollover] Failed to roll task ${task.id}:`, updateError)
      }
    }

    // Mark daily "Leave" in performance logs for users who had incomplete tasks
    for (const profileId of Array.from(profileLeaves)) {
      // Get counts
      const { count: totalCount } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('assigned_to', profileId)
        .eq('scheduled_date', todayDateStr)

      const { count: doneCount } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('assigned_to', profileId)
        .eq('scheduled_date', todayDateStr)
        .eq('status', 'Done')

      const { error: logError } = await supabase
        .from('performance_logs')
        .upsert({
          date: todayDateStr,
          profile_id: profileId,
          assigned_count: totalCount || 0,
          completed_count: doneCount || 0,
          is_leave: true // Flagged as unexcused leave due to incomplete task
        }, { onConflict: 'date,profile_id' })

      if (logError) {
        console.error(`[Cron Rollover] Failed to log performance for ${profileId}:`, logError)
      }
    }

    // 5. Notify Admin of Rollovers & Leaves
    const adminPhone = process.env.ADMIN_WHATSAPP_NUMBER
    if (adminPhone && rolledOverItems.length > 0) {
      const { sendWhatsAppMessage } = await import('@/utils/whatsapp')
      
      const adminMessage = `*LUMORA MONITORING ALERT:*\n\nDay-end checks complete. The following tasks were incomplete and have been *rolled over to tomorrow (${tomorrowDateStr})*.\n\nAssignees have been flagged as *Unexcused Leave*:\n\n${rolledOverItems.join('\n')}`
      
      try {
        await sendWhatsAppMessage(adminPhone, adminMessage)
      } catch (err) {
        console.error('[Cron Rollover] Failed to notify Admin:', err)
      }
    }

    return Response.json({
      success: true,
      message: `Rolled over ${incompleteTasks.length} tasks and logged unexcused leaves.`
    })

  } catch (err: any) {
    console.error('[Cron Rollover Error]:', err)
    return Response.json({ success: false, error: err.message }, { status: 500 })
  }
}
