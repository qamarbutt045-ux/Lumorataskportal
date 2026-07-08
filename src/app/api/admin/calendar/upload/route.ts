import { NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createClient as createStaticSupabase } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // 1. Verify user session
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Query profile role to verify they are an Admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'Admin') {
      return Response.json({ success: false, error: 'Only administrators can upload calendars' }, { status: 403 })
    }

    // 3. Parse FormData
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return Response.json({ success: false, error: 'No file uploaded' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    // 4. Parse Excel Workbook using sheetjs
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(sheet) as any[]

    if (rows.length === 0) {
      return Response.json({ success: false, error: 'Uploaded sheet contains no rows' }, { status: 400 })
    }

    // 5. Initialize service-role client for batch database writes bypassing RLS
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const adminClient = createStaticSupabase(supabaseUrl, serviceRoleKey)

    // Fetch all profiles locally to map name -> profile ID
    const { data: allProfiles } = await adminClient
      .from('profiles')
      .select('id, name')

    const profileMap: Record<string, string> = {}
    if (allProfiles) {
      allProfiles.forEach(p => {
        profileMap[p.name.toLowerCase().trim()] = p.id
      })
    }

    const tasksToInsert: any[] = []
    let skippedCount = 0

    for (const row of rows) {
      // Expected columns: Date, Assignee, Title, Description
      const dateVal = row.Date || row.date
      const assigneeVal = row.Assignee || row.assignee
      const titleVal = row.Title || row.title
      const descVal = row.Description || row.description || row.desc || null

      if (!titleVal) {
        skippedCount++
        continue
      }

      // Resolve representative profile ID
      let assignedToUuid = null
      if (assigneeVal) {
        const cleanName = assigneeVal.toString().toLowerCase().trim()
        assignedToUuid = profileMap[cleanName] || null
      }

      // Parse date accurately
      let scheduledDate: string | null = null
      if (dateVal) {
        if (dateVal instanceof Date) {
          scheduledDate = dateVal.toISOString().split('T')[0]
        } else {
          try {
            const parsedD = new Date(dateVal)
            if (!isNaN(parsedD.getTime())) {
              scheduledDate = parsedD.toISOString().split('T')[0]
            }
          } catch (e) {}
        }
      }

      // Create deadline at 8 PM on the scheduled date
      let deadlineStr = null
      if (scheduledDate) {
        deadlineStr = new Date(`${scheduledDate}T20:00:00`).toISOString()
      }

      tasksToInsert.push({
        title: titleVal,
        description: descVal,
        assigned_to: assignedToUuid,
        scheduled_date: scheduledDate,
        deadline: deadlineStr,
        original_date: scheduledDate,
        status: 'Pending'
      })
    }

    if (tasksToInsert.length === 0) {
      return Response.json({ success: false, error: 'No valid tasks found in the uploaded file' }, { status: 400 })
    }

    // Insert tasks in batch
    const { error: insertError } = await adminClient
      .from('tasks')
      .insert(tasksToInsert)

    if (insertError) throw insertError

    return Response.json({
      success: true,
      message: `Successfully imported ${tasksToInsert.length} tasks from monthly calendar.`,
      skipped: skippedCount
    })

  } catch (err: any) {
    console.error('[Calendar Upload Error]:', err)
    return Response.json({ success: false, error: err.message }, { status: 500 })
  }
}
