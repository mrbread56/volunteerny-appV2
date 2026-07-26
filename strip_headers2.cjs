const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

const securityHeadersBlock = /app\.use\(\(req, res, next\) => \{\n\s*res\.setHeader\('Strict-Transport-Security'[\s\S]*?next\(\);\n\s*\}\);/g;

content = content.replace(securityHeadersBlock, `app.use((req, res, next) => {
    // Disabled security headers for AI Studio preview iframe compatibility
    next();
  });`);

fs.writeFileSync('server.ts', content);
