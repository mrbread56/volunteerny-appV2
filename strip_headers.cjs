const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

const securityHeadersBlock = /res\.setHeader\('Strict-Transport-Security'[\s\S]*?res\.setHeader\('Content-Security-Policy'[^;]+;\);/g;

content = content.replace(securityHeadersBlock, '// Removed security headers that interfere with iframe dev preview');

fs.writeFileSync('server.ts', content);
