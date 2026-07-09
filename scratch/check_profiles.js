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

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  console.log('Fetching all registered profiles...');
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, name, email, phone, role, designation');

  if (error) {
    console.error('Error fetching profiles:', error);
    return;
  }

  console.log('\n--- REGISTERED PROFILES ---');
  profiles.forEach(p => {
    console.log(`- Name: ${p.name}`);
    console.log(`  Role: ${p.role}`);
    console.log(`  Designation: ${p.designation || 'None'}`);
    console.log(`  Phone: ${p.phone || 'NO PHONE'}`);
    console.log(`  Email: ${p.email}`);
    console.log('---------------------------');
  });
}

main();
