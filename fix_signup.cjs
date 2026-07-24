const fs = require('fs');
let content = fs.readFileSync('src/pages/Signup.tsx', 'utf8');

content = content.replace('React.  const startSignupVerification', 'const startSignupVerification');

fs.writeFileSync('src/pages/Signup.tsx', content);
