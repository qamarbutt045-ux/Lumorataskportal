const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables manually from .env.local
const envPath = path.join(__dirname, '..', '.env.local');
if (!fs.existsSync(envPath)) {
  console.error('Error: .env.local file not found.');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] ? match[2].trim() : '';
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.substring(1, value.length - 1);
    }
    env[match[1]] = value;
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
const token = env.WHATSAPP_ACCESS_TOKEN;
const phoneId = env.WHATSAPP_PHONE_NUMBER_ID;
const adminPhone = env.ADMIN_WHATSAPP_NUMBER;

if (!supabaseUrl || !serviceRoleKey || !token || !phoneId) {
  console.error('Error: Missing environment credentials in .env.local.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// WhatsApp Send Utility matching the main app
async function sendWhatsAppMessage(recipientPhone, messageBody) {
  const cleanPhone = recipientPhone.replace(/\D/g, '');
  const url = `https://graph.facebook.com/v18.0/${phoneId}/messages`;
  
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
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(JSON.stringify(data));
  }
  return true;
}

async function main() {
  const todayDateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
  console.log(`[Manual Trigger] Querying active tasks for date: ${todayDateStr}`);

  const { data: tasks, error: fetchError } = await supabase
    .from('tasks')
    .select(`
      id,
      title,
      description,
      assigned_to,
      deadline,
      status,
      profiles:assigned_to (
        id,
        name,
        phone
      )
    `)
    .eq('scheduled_date', todayDateStr)
    .eq('is_active', true)
    .in('status', ['Pending', 'In Progress']);

  if (fetchError) {
    console.error('Failed to fetch tasks:', fetchError.message);
    return;
  }

  if (!tasks || tasks.length === 0) {
    console.log(`No active tasks scheduled for today (${todayDateStr})!`);
    return;
  }

  console.log(`Found ${tasks.length} active tasks to dispatch. Sending now...`);
  let dispatchedCount = 0;

  for (const task of tasks) {
    const profile = task.profiles;
    if (profile && profile.phone) {
      const formattedDeadline = task.deadline 
        ? new Date(task.deadline).toLocaleString('en-US', { timeZone: 'Asia/Karachi' })
        : 'Today';

      const message = `*LUMORA COMMAND:*\n\nSalam ${profile.name},\n\nAapka aaj ka task assign ho chuka hai:\n\n🆔 *Task Code:* ${task.id}\n📝 *Title:* ${task.title}\n📋 *Description:* ${task.description || 'No description provided'}\n📅 *Deadline:* ${formattedDeadline}\n\n*Task complete karne ke baad is message ka reply karein:* ${task.id} DONE`;
      
      try {
        console.log(`Sending to ${profile.name} (${profile.phone})...`);
        await sendWhatsAppMessage(profile.phone, message);
        dispatchedCount++;
        console.log(`Success.`);
      } catch (err) {
        console.error(`Failed to send to ${profile.name}:`, err.message);
      }
    } else {
      console.log(`Skipping task ${task.id} (No assigned phone).`);
    }
  }

  // Notify Admin
  if (adminPhone && dispatchedCount > 0) {
    const adminMessage = `*LUMORA MONITORING ALERT:*\n\nDaily task dispatch successfully completed for *${todayDateStr}*.\n\nTotal tasks dispatched: *${dispatchedCount}*`;
    try {
      await sendWhatsAppMessage(adminPhone, adminMessage);
      console.log('Admin summary dispatched.');
    } catch (err) {
      console.error('Failed to send Admin summary:', err.message);
    }
  }

  console.log(`\nDispatch finished. Successfully sent ${dispatchedCount} tasks.`);
}

main();
