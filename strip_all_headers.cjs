const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

content = content.replace(/res\.setHeader\('Strict-Transport-Security'.*?\n\s*/g, '');
content = content.replace(/res\.setHeader\('X-Content-Type-Options'.*?\n\s*/g, '');
content = content.replace(/res\.setHeader\('Referrer-Policy'.*?\n\s*/g, '');
content = content.replace(/res\.setHeader\('Permissions-Policy'.*?\n\s*/g, '');
content = content.replace(/res\.setHeader\('Content-Security-Policy'.*?\n\s*/g, '');

fs.writeFileSync('server.ts', content);
