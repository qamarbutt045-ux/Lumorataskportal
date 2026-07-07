/**
 * LUMORA - Webhook Test Script
 * Use this script to mock an incoming Meta WhatsApp API payload and test the webhook.
 * Make sure the Next.js development server is running locally (http://localhost:3000).
 * 
 * Run using: node test_webhook.js
 */

const fetch = require('node:http') // Using standard node fetch or HTTP requests

const webhookUrl = 'http://localhost:3000/api/whatsapp/webhook';

// Modify these variables to match your database records for testing
const senderPhoneNumber = '15550199000'; // Phone number assigned to the task owner (no +, match regex)
const taskCode = '#1001'; // The short task code you want to mark DONE
const messageText = `${taskCode} DONE`; // Text message sent by user

const payload = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: '123456789012345',
      changes: [
        {
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '15550199001',
              phone_number_id: '1234567890'
            },
            contacts: [
              {
                profile: {
                  name: 'Alexander Vance'
                },
                wa_id: senderPhoneNumber
              }
            ],
            messages: [
              {
                from: senderPhoneNumber,
                id: 'wamid.HBgLMTU1NTAxOTkwMDAVAgASGBQzQTNBQjRDNDU2Nzg5MEFCQ0QxMgA=',
                timestamp: '1672531199',
                text: {
                  body: messageText
                },
                type: 'text'
              }
            ]
          },
          field: 'messages'
        }
      ]
    }
  ]
};

console.log(`Sending mock payload to ${webhookUrl}...`);
console.log(`Payload content: "${messageText}" from ${senderPhoneNumber}`);

const data = JSON.stringify(payload);

const req = httpPost(webhookUrl, data, (response) => {
  console.log(`Response Status: ${response.statusCode}`);
  let responseData = '';
  response.on('data', (chunk) => {
    responseData += chunk;
  });
  response.on('end', () => {
    console.log('Response Body:', JSON.parse(responseData));
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
  console.log('\nMake sure your Next.js server is running on http://localhost:3000 by executing: npm run dev');
});

// Helper function to perform HTTP POST request in standard node
function httpPost(url, data, callback) {
  const urlObj = new URL(url);
  const options = {
    hostname: urlObj.hostname,
    port: urlObj.port,
    path: urlObj.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  const http = require('node:http');
  const req = http.request(options, callback);
  req.write(data);
  req.end();
  return req;
}
