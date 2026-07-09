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

    // Create a local map of all original Excel rows to resolve skipped approvals recursively
    const originalRowsMap: Record<string, any> = {}
    rows.forEach(row => {
      const rowId = row['Task ID'] || row['task_id'] || row['ID'] || row['id']
      if (rowId) {
        originalRowsMap[rowId.toString().trim()] = row
      }
    })

    const tasksToInsert: any[] = []
    const resolvedDeps: (string | null)[] = [] // Tracks dependency mapping per index
    let skippedCount = 0

    for (const row of rows) {
      const rowId = row['Task ID'] || row['task_id'] || row['ID'] || row['id'] || ''
      const dateVal = row.Date || row.date || row['Due Date'] || row['due_date'] || row['Start Date'] || row['start_date']
      const assigneeVal = row.Assignee || row.assignee || row['Assignee Name'] || row['assignee_name']
      const titleVal = row.Title || row.title || row['Task Name'] || row['task_name']
      const descVal = row.Description || row.description || row.desc || row.Checklist || row.checklist || null
      const timeVal = row['Time Block'] || row['time_block'] || row['Due Time'] || row['due_time']

      if (!titleVal) {
        skippedCount++
        continue
      }

      // Check if this is an approval task -> SKIP IT entirely!
      const isApprovalTask = 
        rowId.toString().toUpperCase().includes('APPROVAL') || 
        titleVal.toString().toUpperCase().includes('APPROVE')

      if (isApprovalTask) {
        skippedCount++
        continue
      }

      // Resolve representative profile ID using robust fuzzy/includes matching
      let assignedToUuid = null
      if (assigneeVal && allProfiles) {
        const cleanName = assigneeVal.toString().toLowerCase().trim()
        const matchedProfile = allProfiles.find(p => {
          const profileName = p.name.toLowerCase().trim()
          return profileName.includes(cleanName) || cleanName.includes(profileName)
        })
        if (matchedProfile) {
          assignedToUuid = matchedProfile.id
        }
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

      // Resolve deadline time
      let deadlineStr = null
      if (scheduledDate) {
        if (timeVal) {
          const cleanTime = timeVal.toString().trim()
          const timeFormatted = cleanTime.includes(':') ? cleanTime : `${cleanTime}:00`
          deadlineStr = new Date(`${scheduledDate}T${timeFormatted}`).toISOString()
        } else {
          deadlineStr = new Date(`${scheduledDate}T20:00:00`).toISOString()
        }
      }

      // Resolve dependency chain recursively through any skipped approval tasks
      const depCodeVal = row['Dependency'] || row['dependency'] || row['Predecessor']
      let resolvedDep = depCodeVal ? depCodeVal.toString().trim() : null
      let requiresApproval = false

      if (resolvedDep) {
        while (originalRowsMap[resolvedDep]) {
          const depRow = originalRowsMap[resolvedDep]
          const depTitle = depRow.Title || depRow.title || ''
          const depId = depRow['Task ID'] || depRow['task_id'] || depRow['ID'] || depRow['id'] || ''
          
          const isApproval = depId.toString().toUpperCase().includes('APPROVAL') || depTitle.toString().toUpperCase().includes('APPROVE')
          if (isApproval) {
            requiresApproval = true
            const nextDep = depRow.Dependency || depRow.dependency || depRow.Predecessor
            if (nextDep) {
              resolvedDep = nextDep.toString().trim()
            } else {
              resolvedDep = null
              break
            }
          } else {
            break
          }
        }
      }

      resolvedDeps.push(resolvedDep)

      tasksToInsert.push({
        title: titleVal,
        description: descVal,
        assigned_to: assignedToUuid,
        scheduled_date: scheduledDate,
        deadline: deadlineStr,
        original_date: scheduledDate,
        status: 'Pending',
        is_active: true, // Will be locked later if dependency is resolved
        requires_approval: requiresApproval
      })
    }

    if (tasksToInsert.length === 0) {
      return Response.json({ success: false, error: 'No valid tasks found in the uploaded file' }, { status: 400 })
    }

    // Insert tasks in batch and select returned rows to resolve dependency chains
    const { data: insertedTasks, error: insertError } = await adminClient
      .from('tasks')
      .insert(tasksToInsert)
      .select()

    if (insertError) throw insertError

    // 6. Build and link predecessor pipeline dependencies (Predecessor Code match)
    if (insertedTasks && insertedTasks.length > 0) {
      // Build a map of Task ID from the sheet -> inserted database task ID
      const taskIdMap: Record<string, string> = {}
      insertedTasks.forEach((t, idx) => {
        const row = rows[idx]
        const rowId = row['Task ID'] || row['task_id'] || row['ID'] || row['id']
        if (rowId) {
          taskIdMap[rowId.toString().trim()] = t.id
        }
      })

      const updates = []
      
      for (let i = 0; i < insertedTasks.length; i++) {
        const resolvedDepCode = resolvedDeps[i]
        
        if (resolvedDepCode) {
          const predecessorDbId = taskIdMap[resolvedDepCode]
          
          if (predecessorDbId) {
            // Update predecessor next_task_id to B, and lock successor task B (is_active = false)
            updates.push(
              adminClient
                .from('tasks')
                .update({ next_task_id: insertedTasks[i].id })
                .eq('id', predecessorDbId),
              adminClient
                .from('tasks')
                .update({ is_active: false })
                .eq('id', insertedTasks[i].id)
            )
          }
        }
      }

      if (updates.length > 0) {
        await Promise.all(updates)
      }
    }

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
