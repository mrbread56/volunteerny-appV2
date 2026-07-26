const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

content = content.replace(
  "res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');",
  "res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');"
);

fs.writeFileSync('server.ts', content);
