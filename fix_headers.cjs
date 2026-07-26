const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

content = content.replace(/res\.setHeader\('X-Frame-Options', 'SAMEORIGIN'\);\n\s*/g, '');
content = content.replace(/res\.setHeader\('Cross-Origin-Opener-Policy', '[^']+'\);\n\s*/g, '');
content = content.replace(/res\.setHeader\('Cross-Origin-Resource-Policy', '[^']+'\);\n\s*/g, '');

fs.writeFileSync('server.ts', content);
