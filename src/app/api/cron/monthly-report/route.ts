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

    // 2. Fetch all performance logs
    const { data: logs, error: fetchError } = await supabase
      .from('performance_logs')
      .select(`
        date,
        profile_id,
        assigned_count,
        completed_count,
        is_leave,
        profiles:profile_id (
          id,
          name,
          phone,
          designation
        )
      `)

    if (fetchError) throw fetchError

    if (!logs || logs.length === 0) {
      return Response.json({ success: true, message: 'No performance data found for report generation.' })
    }

    // Resolve current month/year name (Pakistan Time)
    const monthName = new Date().toLocaleString('en-US', { 
      month: 'long', 
      year: 'numeric', 
      timeZone: 'Asia/Karachi' 
    }).toUpperCase()

    // 3. Compile statistics grouped by profile
    const stats: Record<string, {
      name: string,
      phone: string | null,
      designation: string,
      assigned: number,
      completed: number,
      leaves: number
    }> = {}

    logs.forEach(log => {
      const profile = log.profiles as any
      if (!profile) return

      if (!stats[profile.id]) {
        stats[profile.id] = {
          name: profile.name,
          phone: profile.phone || null,
          designation: profile.designation || 'Team Representative',
          assigned: 0,
          completed: 0,
          leaves: 0
        }
      }

      stats[profile.id].assigned += log.assigned_count
      stats[profile.id].completed += log.completed_count
      if (log.is_leave) {
        stats[profile.id].leaves += 1
      }
    })

    const { sendWhatsAppMessage } = await import('@/utils/whatsapp')
    const adminSummaryItems: string[] = []

    // 4. Send report cards to each representative
    for (const [profileId, data] of Object.entries(stats)) {
      const completionRate = data.assigned > 0 ? Math.round((data.completed / data.assigned) * 100) : 100
      
      // Compile items for Admin summary
      adminSummaryItems.push(`- *${data.name}* (${data.designation}): ${data.completed}/${data.assigned} Done | ${data.leaves} Leaves | *${completionRate}% Rate*`)

      if (data.phone) {
        const reportCardMsg = `*LUMORA MONTHLY PERFORMANCE CARD (${monthName})*\n\n*Name:* ${data.name}\n*Designation:* ${data.designation}\n\n📋 *Total Assigned Tasks:* ${data.assigned}\n✅ *Successfully Completed:* ${data.completed}\n🛑 *Unexcused Leaves (Incomplete days):* ${data.leaves}\n📊 *Completion Rate:* ${completionRate}%\n\n_Thank you for your contribution to the Lumora team. Let's make next month even better!_`
        
        try {
          await sendWhatsAppMessage(data.phone, reportCardMsg)
        } catch (err) {
          console.error(`[Monthly Report] Failed to dispatch card to ${data.name}:`, err)
        }
      }
    }

    // 5. Send master summary report card to Admin
    const adminPhone = process.env.ADMIN_WHATSAPP_NUMBER
    if (adminPhone && adminSummaryItems.length > 0) {
      const adminSummaryMsg = `*LUMORA TEAM SUMMARY STATEMENT (${monthName})*\n\nAll monthly report cards have been successfully dispatched. Here is the team overview:\n\n${adminSummaryItems.join('\n')}`
      try {
        await sendWhatsAppMessage(adminPhone, adminSummaryMsg)
      } catch (err) {
        console.error('[Monthly Report] Failed to notify Admin summary card:', err)
      }
    }

    return Response.json({
      success: true,
      message: `Dispatched monthly reports to ${Object.keys(stats).length} employees.`
    })

  } catch (err: any) {
    console.error('[Monthly Report Error]:', err)
    return Response.json({ success: false, error: err.message }, { status: 500 })
  }
}
