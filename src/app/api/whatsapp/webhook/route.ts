import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
// Initialize using Service Role to bypass RLS policies for server-side webhook writes
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

// 1. VERIFICATION ENDPOINT (Meta takes this to verify your webhook)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  // Set the verify token to 'Qamar123' (fallback to env)
  const MY_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'Qamar123'

  if (mode === 'subscribe' && token === MY_VERIFY_TOKEN) {
    console.log('[WhatsApp Webhook] URL verified successfully with token.')
    return new Response(challenge, { status: 200 })
  }
  return new Response('Verification failed', { status: 403 })
}

// 2. INCOMING MESSAGE HANDLER (When user replies #[Code] DONE)
export async function POST(request: Request) {
  try {
    const body = await request.json()
    
    // Log the payload so Vercel logs display it
    console.log("Inbound Webhook Received Body:", JSON.stringify(body))

    if (body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
      const message = body.entry[0].changes[0].value.messages[0]
      const fromNumber = message.from // User's WhatsApp number
      const textBody = message.text?.body?.trim().toUpperCase() || ""

      // Matches # followed by numbers, then space, then DONE anywhere in text
      const match = textBody.match(/#(\d+)\s+DONE/i)

      if (match) {
        const taskCode = match[1]
        const fullTaskId = '#' + taskCode
        console.log(`Processing Task Code: ${fullTaskId} from sender: ${fromNumber}`)

        // Supabase Status Update (Uses service role client to bypass RLS)
        const { error } = await supabase
          .from('tasks')
          .update({ status: 'Done' })
          .eq('id', fullTaskId)

        if (error) {
          console.error("Supabase Error:", error)
        } else {
          console.log(`Task ${fullTaskId} successfully marked as DONE!`)
          
          // Send confirmation back to sender
          try {
            const { sendWhatsAppMessage } = await import('@/utils/whatsapp')
            const confirmationMsg = `*LUMORA COMMAND:*\n\nTask *${fullTaskId}* has been marked as *DONE*. Great work!`
            await sendWhatsAppMessage(fromNumber, confirmationMsg)
          } catch (err) {
            console.error("[Webhook Outgoing] Confirmation send failed:", err)
          }
        }
      }
    }

    // Always return 200 response to acknowledge Meta webhook
    return new Response(JSON.stringify({ status: 'success' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (err: any) {
    console.error("Webhook Global Error:", err)
    return new Response(JSON.stringify({ error: err.message }), { status: 200 }) 
  }
}
