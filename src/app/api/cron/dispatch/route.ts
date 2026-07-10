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

    // 2. Resolve current date in Pakistan Time (Asia/Karachi)
    const todayDateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' })
    console.log(`[Cron Dispatch] Resolving task list for date: ${todayDateStr}`)

    // 3. Fetch today's tasks with assignee details
    const { data: tasks, error: fetchError } = await supabase
      .from('tasks')
      .select(`
        id,
        title,
        description,
        assigned_to,
        deadline,
        status,
        profiles:assigned_to (
          id,
          name,
          phone
        )
      `)
      .eq('scheduled_date', todayDateStr)
      .eq('is_active', true)
      .in('status', ['Pending', 'In Progress'])

    if (fetchError) throw fetchError

    if (!tasks || tasks.length === 0) {
      return Response.json({ success: true, message: `No tasks scheduled for ${todayDateStr}` })
    }

    // 4. Send WhatsApp notifications
    const { sendWhatsAppMessage } = await import('@/utils/whatsapp')
    let dispatchedCount = 0

    for (const task of tasks) {
      const profile = task.profiles as any
      if (profile?.phone) {
        const formattedDeadline = task.deadline 
          ? new Date(task.deadline).toLocaleString('en-US', { timeZone: 'Asia/Karachi' })
          : 'Today'

        const message = `*LUMORA COMMAND:*\n\nSalam ${profile.name},\n\nAapka aaj ka task assign ho chuka hai:\n\n🆔 *Task Code:* ${task.id}\n📝 *Title:* ${task.title}\n📋 *Description:* ${task.description || 'No description provided'}\n📅 *Deadline:* ${formattedDeadline}\n\n*Task complete karne ke baad is message ka reply karein:* ${task.id} DONE`
        
        try {
          await sendWhatsAppMessage(profile.phone, message)
          dispatchedCount++
        } catch (err) {
          console.error(`[Cron Dispatch] Failed to send to ${profile.name} (${profile.phone}):`, err)
        }
      }
    }

    // 5. Notify Admin of summary report
    const adminPhone = process.env.ADMIN_WHATSAPP_NUMBER
    if (adminPhone && dispatchedCount > 0) {
      const adminMessage = `*LUMORA MONITORING ALERT:*\n\nDaily task dispatch successfully completed for *${todayDateStr}*.\n\nTotal tasks dispatched: *${dispatchedCount}*`
      try {
        await sendWhatsAppMessage(adminPhone, adminMessage)
      } catch (err) {
        console.error('[Cron Dispatch] Failed to send Admin summary alert:', err)
      }
    }

    return Response.json({
      success: true,
      message: `Successfully dispatched ${dispatchedCount} tasks for ${todayDateStr}.`
    })

  } catch (err: any) {
    console.error('[Cron Dispatch Error]:', err)
    return Response.json({ success: false, error: err.message }, { status: 500 })
  }
}
