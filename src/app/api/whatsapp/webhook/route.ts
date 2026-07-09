import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

// 1. VERIFICATION ENDPOINT
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  const MY_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'Qamar123'

  if (mode === 'subscribe' && token === MY_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 })
  }
  return new Response('Verification failed', { status: 403 })
}

// 2. INCOMING MESSAGE HANDLER
export async function POST(request: Request) {
  try {
    const body = await request.json()
    console.log("Inbound Webhook Received Body:", JSON.stringify(body))

    if (body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
      const message = body.entry[0].changes[0].value.messages[0]
      const fromNumber = message.from // User's WhatsApp number (e.g. 923445552403)
      const textBody = message.text?.body?.trim().toUpperCase() || ""

      const { sendWhatsAppMessage } = await import('@/utils/whatsapp')

      // Clean sender phone for profile lookup
      const cleanPhone = fromNumber.replace(/\D/g, '')
      const adminPhone = process.env.ADMIN_WHATSAPP_NUMBER

      // COMMAND A: ADMIN REMOTE APPROVAL (e.g. #1029 APPROVE or #1029 REJECT feedback)
      const approvalMatch = textBody.match(/#(\d+)\s+(APPROVE|REJECT)(?:\s+(.*))?/i)
      const isAdminSender = cleanPhone === adminPhone?.replace(/\D/g, '')

      if (approvalMatch && isAdminSender) {
        const taskCode = approvalMatch[1]
        const fullTaskId = '#' + taskCode
        const action = approvalMatch[2].toUpperCase()
        const feedback = approvalMatch[3] || 'No feedback provided'

        console.log(`[Admin Control] Received approval command ${action} for task ${fullTaskId} from Admin.`)

        if (action === 'APPROVE') {
          // Unlock and activate the successor task (UPLOAD)
          const { data: unlockedTask, error: unlockError } = await supabase
            .from('tasks')
            .update({ is_active: true, status: 'In Progress' })
            .eq('id', fullTaskId)
            .select('id, title, description, assigned_to, profiles:assigned_to (name, phone)')
            .maybeSingle()

          if (unlockError) throw unlockError

          if (unlockedTask) {
            const assignee = unlockedTask.profiles as any
            if (assignee?.phone) {
              const pipelineAlert = `*LUMORA PIPELINE TRIGGER:*\n\nSalam ${assignee.name},\n\nThe Admin has *APPROVED* the previous step! Your task is now *ACTIVE*:\n\n🆔 *Task Code:* ${unlockedTask.id}\n📝 *Title:* ${unlockedTask.title}\n📋 *Description:* ${unlockedTask.description || 'No description'}\n\n*Reply with ${unlockedTask.id} DONE once uploaded.*`
              try {
                await sendWhatsAppMessage(assignee.phone, pipelineAlert)
              } catch (e) {
                console.error('[Admin Approve] Failed to notify assignee:', e)
              }
            }
            await sendWhatsAppMessage(fromNumber, `*LUMORA CONTROL:*\n\nTask *${fullTaskId}* successfully *APPROVED* and unlocked for ${assignee?.name || 'assignee'}.`)
          } else {
            await sendWhatsAppMessage(fromNumber, `*LUMORA CONTROL:*\n\nError: Task *${fullTaskId}* was not found.`)
          }
        } else if (action === 'REJECT') {
          // Re-lock the task and find predecessor (DESIGN) to request revisions
          const { data: predecessorTask, error: predError } = await supabase
            .from('tasks')
            .update({ status: 'In Progress' }) // Reset back to active so they must redo it
            .eq('next_task_id', fullTaskId)
            .select('id, title, assigned_to, profiles:assigned_to (name, phone)')
            .maybeSingle()

          if (predError) throw predError

          if (predecessorTask) {
            const designer = predecessorTask.profiles as any
            if (designer?.phone) {
              const rejectMsg = `*LUMORA REVISION REQUEST:*\n\nSalam ${designer.name},\n\nThe Admin has requested revisions on your design task *${predecessorTask.title}* (${predecessorTask.id}).\n\n💬 *Feedback:* ${feedback}\n\nPlease update the design and reply *${predecessorTask.id} DONE* once revised.`
              try {
                await sendWhatsAppMessage(designer.phone, rejectMsg)
              } catch (e) {
                console.error('[Admin Reject] Failed to notify designer:', e)
              }
            }
            await sendWhatsAppMessage(fromNumber, `*LUMORA CONTROL:*\n\nTask *${fullTaskId}* *REJECTED*. Revision request sent to ${designer?.name || 'assignee'} with feedback: "${feedback}".`)
          } else {
            await sendWhatsAppMessage(fromNumber, `*LUMORA CONTROL:*\n\nError: Predecessor task for *${fullTaskId}* was not found.`)
          }
        }

        return Response.json({ status: 'success', action: `admin_${action}` })
      }

      const { data: senderProfile } = await supabase
        .from('profiles')
        .select('id, name, designation')
        .ilike('phone', `%${cleanPhone.slice(-9)}%`)
        .single()

      // COMMAND B: MENU / HELP
      if (textBody === 'MENU' || textBody === 'HELP') {
        const menuMsg = `*LUMORA INTERACTIVE MENU:*\n\nSend these commands to monitor your work:\n\n📋 *TASKS* - View your active tasks for today.\n📊 *STATS* - View your monthly performance report.\n\n*To mark a task complete:* #[Code] DONE`
        await sendWhatsAppMessage(fromNumber, menuMsg)
        return Response.json({ status: 'success', action: 'menu' })
      }

      // COMMAND C: TASKS list
      if (textBody === 'TASKS') {
        if (!senderProfile) {
          await sendWhatsAppMessage(fromNumber, `*LUMORA ERROR:*\n\nYour phone number (${fromNumber}) is not registered in our database. Please contact the Admin.`)
          return Response.json({ status: 'unregistered' })
        }

        const todayDateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' })
        const { data: activeTasks } = await supabase
          .from('tasks')
          .select('id, title, status')
          .eq('assigned_to', senderProfile.id)
          .eq('scheduled_date', todayDateStr)
          .eq('is_active', true)
          .neq('status', 'Done')

        if (!activeTasks || activeTasks.length === 0) {
          await sendWhatsAppMessage(fromNumber, `*LUMORA TASKS:*\n\nSalam ${senderProfile.name}, you have no pending tasks scheduled for today (${todayDateStr})! Great job!`)
        } else {
          const taskItems = activeTasks.map(t => `- *${t.id}*: ${t.title} (${t.status})`).join('\n')
          await sendWhatsAppMessage(fromNumber, `*LUMORA TASKS FOR TODAY:*\n\nSalam ${senderProfile.name}, here are your active tasks:\n\n${taskItems}\n\n*Reply #[Code] DONE to complete.*`)
        }
        return Response.json({ status: 'success', action: 'tasks' })
      }

      // COMMAND D: PERFORMANCE STATS
      if (textBody === 'STATS') {
        if (!senderProfile) {
          await sendWhatsAppMessage(fromNumber, `*LUMORA ERROR:*\n\nYour profile was not found. Please contact the Admin.`)
          return Response.json({ status: 'unregistered' })
        }

        const { data: logs } = await supabase
          .from('performance_logs')
          .select('assigned_count, completed_count, is_leave')
          .eq('profile_id', senderProfile.id)

        let totalAssigned = 0
        let totalCompleted = 0
        let totalLeaves = 0

        if (logs) {
          logs.forEach(log => {
            totalAssigned += log.assigned_count
            totalCompleted += log.completed_count
            if (log.is_leave) totalLeaves++
          })
        }

        const completionRate = totalAssigned > 0 ? Math.round((totalCompleted / totalAssigned) * 100) : 100
        const statsMsg = `*LUMORA PERFORMANCE STATS:*\n\n*Name:* ${senderProfile.name}\n*Role:* ${senderProfile.designation || 'Team Member'}\n\n📋 *Assigned Tasks:* ${totalAssigned}\n✅ *Completed Tasks:* ${totalCompleted}\n🛑 *Leaves logged:* ${totalLeaves}\n📈 *Completion Rate:* ${completionRate}%`
        
        await sendWhatsAppMessage(fromNumber, statsMsg)
        return Response.json({ status: 'success', action: 'stats' })
      }

      // STANDARD FLOW: #[Code] DONE match
      const match = textBody.match(/#(\d+)\s+DONE/i)

      if (match) {
        const taskCode = match[1]
        const fullTaskId = '#' + taskCode
        console.log(`Processing Task Code: ${fullTaskId} from sender: ${fromNumber}`)

        // Fetch task details before updating
        const { data: taskDetails } = await supabase
          .from('tasks')
          .select('title, next_task_id, in_progress_at, created_at, profiles:assigned_to (name, phone)')
          .eq('id', fullTaskId)
          .single()

        let durationSeconds = null
        if (taskDetails) {
          const startTimeStr = taskDetails.in_progress_at || taskDetails.created_at
          if (startTimeStr) {
            const diffMs = Date.now() - new Date(startTimeStr).getTime()
            durationSeconds = Math.max(0, Math.floor(diffMs / 1000))
          }
        }

        // Update task status to Done
        const { error: updateError } = await supabase
          .from('tasks')
          .update({ 
            status: 'Done', 
            completed_at: new Date().toISOString(),
            duration_seconds: durationSeconds
          })
          .eq('id', fullTaskId)

        if (updateError) {
          console.error("Supabase Error:", updateError)
        } else {
          console.log(`Task ${fullTaskId} marked as DONE in ${durationSeconds || 0}s!`)
          
          // Send confirmation back to employee
          try {
            const confirmationMsg = `*LUMORA COMMAND:*\n\nTask *${fullTaskId}* has been marked as *DONE*. Great work!`
            await sendWhatsAppMessage(fromNumber, confirmationMsg)
          } catch (err) {
            console.error("[Webhook Outgoing] Confirmation send failed:", err)
          }

          // Send monitoring completion notification to Admin
          const assigneeName = (taskDetails?.profiles as any)?.name || 'Team Member'
          const assigneePhone = (taskDetails?.profiles as any)?.phone || fromNumber

          if (adminPhone) {
            try {
              const adminAlert = `*LUMORA MONITORING ALERT:*\n\nEmployee *${assigneeName}* (${assigneePhone}) has completed task *${fullTaskId}* ("${taskDetails?.title || ''}") via WhatsApp.`
              await sendWhatsAppMessage(adminPhone, adminAlert)
            } catch (err) {
              console.error("[Webhook Outgoing] Admin alert send failed:", err)
            }
          }

          // AUTO-HANDOVER CHAIN TRIGGER
          if (taskDetails?.next_task_id) {
            console.log(`[Handover Chain] Querying next task: ${taskDetails.next_task_id}`)

            // Fetch details of successor task
            const { data: nextTask, error: nextTaskError } = await supabase
              .from('tasks')
              .select('id, title, description, requires_approval, assigned_to, profiles:assigned_to (name, phone)')
              .eq('id', taskDetails.next_task_id)
              .single()

            if (nextTaskError) {
              console.error('[Handover Chain] Failed to fetch successor task details:', nextTaskError)
            } else if (nextTask) {
              const nextAssignee = nextTask.profiles as any

              if (nextTask.requires_approval) {
                // Halts activation, keeps it locked, and dispatches approval request card to Admin (Hussnain)
                if (adminPhone) {
                  const approvalRequestMsg = `*LUMORA APPROVAL REQUEST:*\n\nEmployee *${assigneeName}* has completed the predecessor task for *${taskDetails.title}*.\n\n🆔 *Upload Task Code:* ${nextTask.id}\n📝 *Title:* ${nextTask.title}\n\nReply with *${nextTask.id} APPROVE* to unlock and dispatch, or *${nextTask.id} REJECT [Feedback]* to request revisions.`
                  try {
                    await sendWhatsAppMessage(adminPhone, approvalRequestMsg)
                    console.log(`[Handover Chain] Approval request card successfully sent to Admin. Task ${nextTask.id} remains locked.`)
                  } catch (err) {
                    console.error('[Handover Chain] Failed to send approval request card to Admin:', err)
                  }
                }
              } else {
                // Standard flow: auto-activate successor task immediately
                const { error: activateError } = await supabase
                  .from('tasks')
                  .update({ is_active: true, status: 'In Progress' })
                  .eq('id', nextTask.id)

                if (activateError) {
                  console.error('[Handover Chain] Failed to activate successor task:', activateError)
                } else if (nextAssignee?.phone) {
                  const pipelineAlert = `*LUMORA PIPELINE TRIGGER:*\n\nSalam ${nextAssignee.name},\n\nPredecessor task completed! Your linked pipeline task is now *ACTIVE*:\n\n🆔 *Task Code:* ${nextTask.id}\n📝 *Title:* ${nextTask.title}\n📋 *Description:* ${nextTask.description || 'No description'}\n\n*Reply with ${nextTask.id} DONE once completed.*`
                  
                  try {
                    await sendWhatsAppMessage(nextAssignee.phone, pipelineAlert)
                    console.log(`[Handover Chain] Successfully notified next assignee: ${nextAssignee.name}`)
                  } catch (err) {
                    console.error('[Handover Chain] Failed to dispatch WhatsApp trigger:', err)
                  }
                }
              }
            }
          }
        }
        return Response.json({ status: 'success', updatedTask: fullTaskId })
      }
    }

    return Response.json({ status: 'ignored' })

  } catch (err: any) {
    console.error("Webhook Global Error:", err)
    return new Response(JSON.stringify({ error: err.message }), { status: 200 }) 
  }
}
