/**
 * LUMORA - WhatsApp Cloud API Send Message & Media Utility
 */
export async function sendWhatsAppMessage(recipientPhone: string, messageBody: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID

  if (!token || !phoneId) {
    console.warn('[WhatsApp Send] Missing Meta Cloud API credentials in environment variables.')
    return false
  }

  const cleanPhone = recipientPhone.replace(/\D/g, '')

  const url = `https://graph.facebook.com/v18.0/${phoneId}/messages`
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanPhone,
        type: 'text',
        text: {
          preview_url: false,
          body: messageBody
        }
      })
    })

    const data = await response.json()
    if (!response.ok) {
      console.error('[WhatsApp Send] Meta Graph API Error details:', data)
      return false
    }

    console.log(`[WhatsApp Send] Message dispatched successfully to ${cleanPhone}`)
    return true
  } catch (error) {
    console.error('[WhatsApp Send] HTTP Fetch Exception:', error)
    return false
  }
}

/**
 * Uploads a file buffer (PDF) to Meta Cloud API to obtain a media ID.
 */
export async function uploadMediaToMeta(buffer: Buffer, filename: string): Promise<string | null> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID

  if (!token || !phoneId) {
    console.warn('[WhatsApp Media] Missing Meta credentials for upload.')
    return null
  }

  const url = `https://graph.facebook.com/v18.0/${phoneId}/media`
  try {
    const formData = new FormData()
    const blob = new Blob([new Uint8Array(buffer)], { type: 'application/pdf' })
    formData.append('file', blob, filename)
    formData.append('messaging_product', 'whatsapp')
    formData.append('type', 'application/pdf')

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    })

    const data = await response.json()
    if (!response.ok) {
      console.error('[WhatsApp Media] Meta Media Upload Error:', data)
      return null
    }

    console.log(`[WhatsApp Media] File uploaded successfully. Media ID: ${data.id}`)
    return data.id
  } catch (error) {
    console.error('[WhatsApp Media] Upload Exception:', error)
    return null
  }
}

/**
 * Sends an uploaded media document to a recipient phone.
 */
export async function sendWhatsAppDocument(recipientPhone: string, mediaId: string, filename: string): Promise<boolean> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID

  if (!token || !phoneId) {
    console.warn('[WhatsApp Document] Missing credentials for dispatch.')
    return false
  }

  const cleanPhone = recipientPhone.replace(/\D/g, '')
  const url = `https://graph.facebook.com/v18.0/${phoneId}/messages`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanPhone,
        type: 'document',
        document: {
          id: mediaId,
          filename: filename
        }
      })
    })

    const data = await response.json()
    if (!response.ok) {
      console.error('[WhatsApp Document] Meta Document Send Error:', data)
      return false
    }

    console.log(`[WhatsApp Document] PDF statement "${filename}" successfully dispatched to ${cleanPhone}`)
    return true
  } catch (error) {
    console.error('[WhatsApp Document] Dispatch Exception:', error)
    return false
  }
}
