/**
 * AETHERIS - WhatsApp Send Debug Script
 * Use this script to test outgoing WhatsApp messages and inspect the exact error response from Meta.
 * 
 * Run using: node test_whatsapp_send.js
 */

const fs = require('fs');
const path = require('path');
const http = require('https');

// Load environment variables manually from .env.local
const envPath = path.join(__dirname, '.env.local');
if (!fs.existsSync(envPath)) {
  console.error('Error: .env.local file not found at project root.');
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

const token = env.WHATSAPP_TOKEN || env.WHATSAPP_ACCESS_TOKEN;
const phoneId = env.WHATSAPP_PHONE_NUMBER_ID;

// CHANGE THIS to your phone number (+923701645009) to test delivery
const testPhone = '923701645009'; 

if (!token || !phoneId) {
  console.error('Error: WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID is missing in .env.local.');
  console.log('Current loaded env keys:', Object.keys(env));
  process.exit(1);
}

console.log('----------------------------------------------------');
console.log('WHATSAPP SEND DIAGNOSTIC TOOL');
console.log('----------------------------------------------------');
console.log(`Sending from Phone ID: ${phoneId}`);
console.log(`Sending to Recipient: ${testPhone}`);
console.log(`Using Token (First 15 chars): ${token.substring(0, 15)}...`);
console.log('----------------------------------------------------');

const postData = JSON.stringify({
  messaging_product: 'whatsapp',
  recipient_type: 'individual',
  to: testPhone,
  type: 'text',
  text: {
    body: 'LUMORA TEST: Diagnostic check. If you receive this, your outbound WhatsApp channel is active!'
  }
});

const options = {
  hostname: 'graph.facebook.com',
  port: 443,
  path: `/v18.0/${phoneId}/messages`,
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Content-Length': postData.length
  }
};

const req = http.request(options, (res) => {
  console.log(`Response Status Code: ${res.statusCode} ${res.statusMessage}`);
  
  let rawData = '';
  res.on('data', (chunk) => { rawData += chunk; });
  res.on('end', () => {
    try {
      const parsedData = JSON.parse(rawData);
      console.log('\n--- META RESPONSE DETAILS ---');
      console.log(JSON.stringify(parsedData, null, 2));
      console.log('-----------------------------');
      
      if (res.statusCode === 200) {
        console.log('\n✅ Success! The message was accepted by Meta.');
      } else {
        console.log('\n❌ Failed! Review the error details from Meta above.');
        if (parsedData.error?.code === 131030) {
          console.log('\n💡 Tip: Recipient has not sent a message to the test number in 24 hours.');
        } else if (parsedData.error?.code === 100) {
          console.log('\n💡 Tip: Check if the Phone Number ID is correct or if the recipient number is verified in the Sandbox.');
        }
      }
    } catch (e) {
      console.log('Raw response:', rawData);
    }
  });
});

req.on('error', (e) => {
  console.error(`Request Error: ${e.message}`);
});

req.write(postData);
req.end();
