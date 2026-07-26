const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

content = content.replace('const redirectUri = req.query.redirect_uri;', 'const redirectUri = req.query.redirect_uri as string;');
content = content.replace('const { code, state, error } = req.query;', 'const code = req.query.code as string;\n    const state = req.query.state as string;\n    const error = req.query.error as string;');

fs.writeFileSync('server.ts', content);
