const fs = require('fs');
let content = fs.readFileSync('src/pages/Signup.tsx', 'utf8');

content = content.replace("signInWithRedirect, getRedirectResult, ", "");

fs.writeFileSync('src/pages/Signup.tsx', content);
