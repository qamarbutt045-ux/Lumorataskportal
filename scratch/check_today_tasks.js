const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
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
const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  const todayDateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
  console.log(`Checking database tasks for date: ${todayDateStr}`);

  const { data: tasks, error } = await supabase
    .from('tasks')
    .select(`
      id,
      title,
      scheduled_date,
      status,
      is_active,
      assigned_to,
      profiles:assigned_to (name, phone)
    `)
    .eq('scheduled_date', todayDateStr);

  if (error) {
    console.error('Database query error:', error.message);
    return;
  }

  console.log(`\nFound ${tasks.length} total tasks scheduled for today.`);
  tasks.forEach(t => {
    console.log(`- [${t.id}] Status: ${t.status} | Active: ${t.is_active} | Title: "${t.title}" | Assignee: ${t.profiles?.name || 'Unassigned'} (${t.profiles?.phone || 'No phone'})`);
  });
}

main();
