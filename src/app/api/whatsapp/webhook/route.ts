import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
// Initialize using Service Role to bypass RLS policies for server-side updates and command reads
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
      const { data: senderProfile } = await supabase
        .from('profiles')
        .select('id, name, designation')
        .ilike('phone', `%${cleanPhone.slice(-9)}%`)
        .single()

      // COMMAND 1: MENU / HELP
      if (textBody === 'MENU' || textBody === 'HELP') {
        const menuMsg = `*LUMORA INTERACTIVE MENU:*\n\nSend these commands to monitor your work:\n\n📋 *TASKS* - View your active tasks for today.\n📊 *STATS* - View your monthly performance report.\n\n*To mark a task complete:* #[Code] DONE`
        await sendWhatsAppMessage(fromNumber, menuMsg)
        return Response.json({ status: 'success', action: 'menu' })
      }

      // COMMAND 2: TASKS list
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

      // COMMAND 3: PERFORMANCE STATS
      if (textBody === 'STATS') {
        if (!senderProfile) {
          await sendWhatsAppMessage(fromNumber, `*LUMORA ERROR:*\n\nYour profile was not found. Please contact the Admin.`)
          return Response.json({ status: 'unregistered' })
        }

        // Fetch monthly performance stats
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
          .select('title, next_task_id, profiles:assigned_to (name, phone)')
          .eq('id', fullTaskId)
          .single()

        // Update task status to Done
        const { error: updateError } = await supabase
          .from('tasks')
          .update({ status: 'Done', completed_at: new Date().toISOString() })
          .eq('id', fullTaskId)

        if (updateError) {
          console.error("Supabase Error:", updateError)
        } else {
          console.log(`Task ${fullTaskId} successfully marked as DONE!`)
          
          // Send confirmation back to employee
          try {
            const confirmationMsg = `*LUMORA COMMAND:*\n\nTask *${fullTaskId}* has been marked as *DONE*. Great work!`
            await sendWhatsAppMessage(fromNumber, confirmationMsg)
          } catch (err) {
            console.error("[Webhook Outgoing] Confirmation send failed:", err)
          }

          // Send monitoring completion notification to Admin
          const adminPhone = process.env.ADMIN_WHATSAPP_NUMBER
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
            console.log(`[Handover Chain] Unlocking downstream successor task: ${taskDetails.next_task_id}`)

            // Unlock and activate successor task in database
            const { data: nextTask, error: nextTaskError } = await supabase
              .from('tasks')
              .update({ is_active: true, status: 'In Progress' })
              .eq('id', taskDetails.next_task_id)
              .select('id, title, description, assigned_to, profiles:assigned_to (name, phone)')
              .single()

            if (nextTaskError) {
              console.error('[Handover Chain] Failed to activate successor task:', nextTaskError)
            } else if (nextTask) {
              const nextAssignee = nextTask.profiles as any
              if (nextAssignee?.phone) {
                // Send activation WhatsApp notification to successor assignee
                const pipelineAlert = `*LUMORA PIPELINE TRIGGER:*\n\nSalam ${nextAssignee.name},\n\nPredecessor task completed! Your linked pipeline task is now *ACTIVE*:\n\n🆔 *Task Code:* ${nextTask.id}\n📝 *Title:* ${nextTask.title}\n📋 *Description:* ${nextTask.description || 'No description'}\n\n*Reply with ${nextTask.id} DONE once completed.*`
                
                try {
                  await sendWhatsAppMessage(nextAssignee.phone, pipelineAlert)
                  console.log(`[Handover Chain] Successfully notified next assignee: ${nextAssignee.name}`)
                } catch (err) {
                  console.error('[Handover Chain] Failed to dispatch WhatsApp trigger:', err)
                }

                // Notify Admin of Pipeline Transition
                if (adminPhone) {
                  const adminPipelineMsg = `*LUMORA MONITORING ALERT:*\n\nPipeline transition: Employee *${assigneeName}* completed predecessor task *${fullTaskId}*. Sequential task *${nextTask.id}* has been unlocked and activated for *${nextAssignee.name}*.`
                  try {
                    await sendWhatsAppMessage(adminPhone, adminPipelineMsg)
                  } catch (e) {}
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
