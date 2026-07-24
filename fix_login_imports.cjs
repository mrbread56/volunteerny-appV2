const fs = require('fs');
let content = fs.readFileSync('src/pages/Login.tsx', 'utf8');

content = content.replace("signInWithRedirect, getRedirectResult, ", "");

fs.writeFileSync('src/pages/Login.tsx', content);
