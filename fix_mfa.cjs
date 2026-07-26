const fs = require('fs');
let content = fs.readFileSync('src/pages/Signup.tsx', 'utf8');

const regex = /      await sendEmailVerification\(user\);\n      setMfaVerified\(true, user\.uid\); await refreshProfile\(\); navigate\("\/"\);/g;
content = content.replace(regex, '      setSignupStep("mfa");');
fs.writeFileSync('src/pages/Signup.tsx', content);
