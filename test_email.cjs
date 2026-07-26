// Simple test script to verify the email endpoint
const http = require('http');

const data = JSON.stringify({
  to: 'kiamehrmetanat@gmail.com',
  subject: 'Test Email',
  templateName: 'welcome_student',
  templateData: {
    studentName: 'Test Student'
  }
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/email/send',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer demo-mode-token-developer',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', body);
    try {
      const parsed = JSON.parse(body);
      console.log('Parsed:', JSON.stringify(parsed, null, 2));
    } catch(e) {
      console.log('Raw response (not JSON):', body);
    }
  });
});

req.on('error', (e) => {
  console.error('Error:', e.message);
});

req.write(data);
req.end();
