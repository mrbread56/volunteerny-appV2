const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf8');

content = content.replace("res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');", "res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');");
content = content.replace("frame-src 'self' https://www.google.com;", "frame-src 'self' https://www.google.com https://volunteer-ny.firebaseapp.com https://volunteer-ny.firebaseapp.com;");

fs.writeFileSync('server.ts', content);
