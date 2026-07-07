import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Initialize Supabase client using Service Role to bypass RLS for webhook updates
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, serviceRoleKey)

/**
 * 1. GET Handler - Webhook Validation for Meta Developer Portal
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  // Set the verify token to 'Qamar123' as requested
  const MY_VERIFY_TOKEN = 'Qamar123'

  if (mode === 'subscribe' && token === MY_VERIFY_TOKEN) {
    console.log('[WhatsApp Webhook] Verification successful with token Qamar123.')
    return new Response(challenge, { status: 200 })
  }

  console.warn('[WhatsApp Webhook] Verification failed. Token mismatch.')
  return new Response('Verification failed', { status: 403 })
}

/**
 * 2. POST Handler - Parse incoming messages and update status
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    console.log('[WhatsApp Webhook] Received webhook payload:', JSON.stringify(body, null, 2))

    // Check if the payload contains WhatsApp message details
    if (body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
      const message = body.entry[0].changes[0].value.messages[0]
      const fromNumber = message.from // Sender's phone number (e.g. 923445552403)
      const textBody = message.text?.body?.trim().toUpperCase() || '' // e.g. "#1009 DONE"

      console.log(`[WhatsApp Webhook] Message: "${textBody}" from phone: ${fromNumber}`)

      // Regex matching: checks format "#[TaskCode] DONE"
      const match = textBody.match(/^#(\d+)\s+DONE$/)

      if (match) {
        const taskCode = '#' + match[1] // Reconstruct code for query, e.g. "#1009"
        console.log(`[WhatsApp Webhook] Matched Task Code: ${taskCode}. Verifying representative...`)

        // Invoke database helper function to check phone ownership and update status
        const { data: success, error: rpcError } = await supabase.rpc(
          'complete_task_via_whatsapp',
          {
            p_task_id: taskCode,
            p_sender_phone: fromNumber
          }
        )

        if (rpcError) {
          console.error('[WhatsApp Webhook] Database RPC Error:', rpcError)
          return Response.json({ status: 'error', message: rpcError.message }, { status: 500 })
        }

        if (!success) {
          console.warn(`[WhatsApp Webhook] Authorization failed. Phone ${fromNumber} is not assigned to task ${taskCode}.`)
          return Response.json({ 
            status: 'unauthorized', 
            message: 'Phone number does not match task assignee or task not found.' 
          }, { status: 400 })
        }

        console.log(`[WhatsApp Webhook] Task ${taskCode} successfully marked as DONE!`)

        // Dispatch confirmation WhatsApp notification
        try {
          const { sendWhatsAppMessage } = await import('@/utils/whatsapp')
          const confirmationMsg = `*LUMORA COMMAND:*\n\nTask *${taskCode}* has been successfully marked as *DONE*. Great work!`
          await sendWhatsAppMessage(fromNumber, confirmationMsg)
        } catch (err) {
          console.error('[WhatsApp Webhook Outgoing] Confirmation send error:', err)
        }

        return Response.json({ status: 'success', updatedTask: taskCode })
      } else {
        console.log('[WhatsApp Webhook] Ignored. Message text format is not "#[Code] DONE"')
      }
    }

    return Response.json({ status: 'ignored' })

  } catch (err: any) {
    console.error('[WhatsApp Webhook] Error:', err)
    return Response.json({ status: 'error', error: err.message }, { status: 500 })
  }
}
