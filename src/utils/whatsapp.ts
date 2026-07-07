/**
 * AETHERIS - WhatsApp Cloud API Send Message Utility
 */
export async function sendWhatsAppMessage(recipientPhone: string, messageBody: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID

  if (!token || !phoneId) {
    console.warn('[WhatsApp Send] Missing Meta Cloud API credentials in environment variables.')
    return false
  }

  // Clean the phone number (remove +, spaces, dashes)
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
