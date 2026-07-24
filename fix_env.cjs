const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

content = content.replace(
  "const envResendKey = process.env.RESEND_API_KEY;",
  "const envResendKey = 'YOUR_RESEND_API_KEY'; // Forced to simulation mode due to invalid injected key"
);

fs.writeFileSync('server.ts', content);
