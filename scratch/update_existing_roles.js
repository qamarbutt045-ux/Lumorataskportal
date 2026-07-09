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
  console.log('Starting profile designation updates...');

  const mappings = [
    { name: 'Qamar', role: 'Meta Ads Expert, Photographer, Videographer' },
    { name: 'Ayesha Fayyaz', role: 'Graphic Designer' },
    { name: 'Hussnain Saeed', role: 'Team Lead and Video Editor' }
  ];

  for (const m of mappings) {
    // Find profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, name')
      .ilike('name', `%${m.name}%`)
      .maybeSingle();

    if (profile) {
      console.log(`Found profile: ${profile.name} (ID: ${profile.id}). Updating designation to "${m.role}"...`);
      
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ designation: m.role })
        .eq('id', profile.id);

      if (updateError) {
        console.error(`Error updating designation for ${profile.name}:`, updateError.message);
      } else {
        console.log(`Successfully updated ${profile.name}.`);
        
        // Also update auth.users metadata
        await supabase.auth.admin.updateUserById(
          profile.id,
          { user_metadata: { designation: m.role } }
        );
      }
    } else {
      console.warn(`Profile for "${m.name}" not found in database.`);
    }
  }

  console.log('\nAll designation updates completed!');
}

main();
