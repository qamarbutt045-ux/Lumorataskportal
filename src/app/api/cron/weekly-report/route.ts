import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateEmployeeReportPDF, generateAdminReportPDF } from '@/utils/reports'
import { uploadMediaToMeta, sendWhatsAppDocument } from '@/utils/whatsapp'

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

    // Determine past 7 days date range (Pakistan Time)
    const today = new Date()
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    
    const startDateStr = sevenDaysAgo.toISOString().split('T')[0]
    const endDateStr = today.toISOString().split('T')[0]
    const periodStr = `${sevenDaysAgo.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

    // 2. Fetch profiles, tasks, and leaves for the period
    const { data: profiles, error: profError } = await supabase
      .from('profiles')
      .select('id, name, phone, designation')
      .eq('role', 'Member')

    if (profError) throw profError

    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select('id, title, status, deadline, completed_at, duration_seconds, assigned_to')
      .gte('scheduled_date', startDateStr)
      .lte('scheduled_date', endDateStr)

    if (tasksError) throw tasksError

    const { data: leaves, error: leavesError } = await supabase
      .from('performance_logs')
      .select('date, profile_id, is_leave')
      .eq('is_leave', true)
      .gte('date', startDateStr)
      .lte('date', endDateStr)

    if (leavesError) throw leavesError

    if (!profiles || profiles.length === 0) {
      return Response.json({ success: true, message: 'No employee profiles registered for weekly report.' })
    }

    // 3. Dispatch individual report statements
    const adminSummaryEmployees: any[] = []
    let totalCompletedAll = 0
    let totalAssignedAll = 0
    let totalLeavesAll = 0

    for (const p of profiles) {
      const empTasks = tasks?.filter(t => t.assigned_to === p.id) || []
      const empLeaves = leaves?.filter(l => l.profile_id === p.id) || []

      const totalAssigned = empTasks.length
      const totalCompleted = empTasks.filter(t => t.status === 'Done').length
      const leavesCount = empLeaves.length
      const completionRate = totalAssigned > 0 ? Math.round((totalCompleted / totalAssigned) * 100) : 100

      totalAssignedAll += totalAssigned
      totalCompletedAll += totalCompleted
      totalLeavesAll += leavesCount

      adminSummaryEmployees.push({
        name: p.name,
        designation: p.designation || 'Team Representative',
        assigned: totalAssigned,
        completed: totalCompleted,
        leaves: leavesCount,
        rate: completionRate
      })

      // Generate and send PDF if employee has a registered phone number
      if (p.phone) {
        const doc = generateEmployeeReportPDF({
          name: p.name,
          designation: p.designation || 'Team Representative',
          period: `Weekly Report (${periodStr})`,
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
        })
        const pdfBuffer = Buffer.from(doc.output('arraybuffer'))

        const filename = `${p.name.replace(/\s+/g, '_')}_weekly_report.pdf`
        const mediaId = await uploadMediaToMeta(pdfBuffer, filename)
        if (mediaId) {
          await sendWhatsAppDocument(p.phone, mediaId, filename)
        }
      }
    }

    // 4. Generate and Dispatch Master Agency Report to Admin
    const adminPhone = process.env.ADMIN_WHATSAPP_NUMBER
    if (adminPhone && adminSummaryEmployees.length > 0) {
      const adminDoc = generateAdminReportPDF({
        period: `Weekly Report (${periodStr})`,
        totalTasks: totalAssignedAll,
        completedTasks: totalCompletedAll,
        pendingTasks: totalAssignedAll - totalCompletedAll,
        leavesCount: totalLeavesAll,
        employees: adminSummaryEmployees
      })
      const adminPdfBuffer = Buffer.from(adminDoc.output('arraybuffer'))

      const filename = `lumora_weekly_agency_report.pdf`
      const mediaId = await uploadMediaToMeta(adminPdfBuffer, filename)
      if (mediaId) {
        await sendWhatsAppDocument(adminPhone, mediaId, filename)
      }
    }

    return Response.json({
      success: true,
      message: `Weekly report statements compiled and dispatched successfully.`
    })

  } catch (err: any) {
    console.error('[Weekly Cron Error]:', err)
    return Response.json({ success: false, error: err.message }, { status: 500 })
  }
}
