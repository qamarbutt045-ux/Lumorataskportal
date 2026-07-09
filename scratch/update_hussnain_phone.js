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
  const newPhone = '+923185135751';
  console.log(`Updating Hussnain Saeed's phone number to ${newPhone}...`);
  
  // Try to find the profile
  let { data: profile, error: findError } = await supabase
    .from('profiles')
    .select('id, name, phone')
    .ilike('name', '%Hussnain%')
    .maybeSingle();

  if (!profile) {
    const { data: profileAlt, error: findErrorAlt } = await supabase
      .from('profiles')
      .select('id, name, phone')
      .ilike('name', '%Husnain%')
      .maybeSingle();

    if (!profileAlt) {
      console.error('Error: Hussnain profile not found in database.');
      return;
    }
    profile = profileAlt;
  }

  console.log(`Found profile: ${profile.name} (ID: ${profile.id}, Current Phone: ${profile.phone})`);

  // 1. Update in profiles table
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ phone: newPhone })
    .eq('id', profile.id);

  if (updateError) {
    console.error('Error updating phone in profiles table:', updateError);
    return;
  }
  console.log(`Successfully updated profiles table record.`);

  // 2. Update user phone/metadata in auth.users using admin auth API
  const { error: authError } = await supabase.auth.admin.updateUserById(
    profile.id,
    { 
      phone: newPhone, 
      phone_confirm: true,
      user_metadata: { phone: newPhone } 
    }
  );

  if (authError) {
    console.warn('Note: Could not update phone in auth.users (this is normal if phone is not used for login):', authError.message);
  } else {
    console.log('Successfully updated phone in auth.users auth record.');
  }

  console.log(`\n✅ Completed! ${profile.name}'s phone number is now connected to ${newPhone}.`);
}

main();
