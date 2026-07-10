const http = require('http');

const postData = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "109849581729384",
      changes: [
        {
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "16505553333",
              phone_number_id: "1203955436136483"
            },
            contacts: [
              {
                profile: {
                  name: "Qamar"
                },
                wa_id: "923445552403"
              }
            ],
            messages: [
              {
                from: "923445552403",
                id: "wamid.HBgMOTIzNDQ1NTUyNDAzFQIAERgSNTlCQjFGNzg4OEI2NDAwMzdEAA==",
                timestamp: "1783407075",
                text: {
                  body: "#1031 DONE"
                },
                type: "text"
              }
            ]
          },
          field: "messages"
        }
      ]
    }
  ]
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/whatsapp/webhook',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': postData.length
  }
};

console.log('Sending mock webhook POST request to http://localhost:3000/api/whatsapp/webhook...');
console.log('Simulating Qamar replying "#1031 DONE"\n');

const req = http.request(options, (res) => {
  console.log(`Response Status: ${res.statusCode} ${res.statusMessage}`);
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('Response Body:', data);
    console.log('\nWebhook simulation complete.');
  });
});

req.on('error', (e) => {
  console.error(`Request Error (is your npm run dev server running on localhost:3000?): ${e.message}`);
});

req.write(postData);
req.end();
