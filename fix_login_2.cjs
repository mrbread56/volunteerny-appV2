const fs = require('fs');
let content = fs.readFileSync('src/pages/Login.tsx', 'utf8');

// Replace the entire "forgot" block up to the "mfa" block.
// We can use a regex to match the "forgot" motion.div
const forgotRegex = /: step === "forgot" \? \([\s\S]*?<motion\.div[\s\S]*?key="forgot"[\s\S]*?<\/motion\.div>\s*\)\s*: step === "mfa" \?/m;

content = content.replace(forgotRegex, ': step === "mfa" ?');

fs.writeFileSync('src/pages/Login.tsx', content);
