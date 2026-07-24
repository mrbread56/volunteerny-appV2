const fs = require('fs');
let content = fs.readFileSync('src/pages/Login.tsx', 'utf8');

// Fix the typescript error with recaptchaToken
content = content.replace(/recaptchaToken = await executeRecaptcha\("login"\);/g, 'recaptchaToken = (await executeRecaptcha("login")).token;');

fs.writeFileSync('src/pages/Login.tsx', content);
