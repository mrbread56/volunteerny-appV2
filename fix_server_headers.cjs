const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

content = content.replace("res.setHeader('X-Frame-Options', 'SAMEORIGIN');", "// res.setHeader('X-Frame-Options', 'SAMEORIGIN');");
content = content.replace("res.setHeader('Referrer-Policy', 'same-origin');", "res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');");
content = content.replace("res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');", "res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');");
content = content.replace("res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');", "res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');");

fs.writeFileSync('server.ts', content);
