const fs = require('fs');
let content = fs.readFileSync('src/pages/Login.tsx', 'utf8');

// The block to replace: from `) : step === "forgot" ? (`
// to `) : step === "mfa" ? (`

const startIndex = content.indexOf(') : step === "forgot" ? (');
const endIndex = content.indexOf(') : step === "mfa" ? (');

if (startIndex !== -1 && endIndex !== -1) {
    const toRemove = content.substring(startIndex, endIndex);
    content = content.replace(toRemove, '');
}

fs.writeFileSync('src/pages/Login.tsx', content);
