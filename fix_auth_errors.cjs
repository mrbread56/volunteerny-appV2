const fs = require('fs');

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(/err\.code === "auth\/operation-not-allowed" \|\| err\.code === "auth\/internal-error" \|\| err\.code === "auth\/unauthorized-domain"/g, 'err.code === "auth/operation-not-allowed"');
  
  // Also we want to ensure auth/internal-error goes to the "add domain" or "support email" message
  content = content.replace(/else if \(err\.code === "auth\/unauthorized-domain"\) \{/g, 'else if (err.code === "auth/unauthorized-domain" || err.code === "auth/internal-error") {');
  
  // Add support email text to the unauthorized domain block
  content = content.replace(/Click "Add domain" and enter: ' \+\s*window\.location\.hostname,/g, 'Click "Add domain" and enter: \' +\n            window.location.hostname +\n            \'. ALSO ensure you have a Support Email configured in the project settings.\',');
  fs.writeFileSync(filePath, content);
}

fixFile('src/pages/Login.tsx');
fixFile('src/pages/Signup.tsx');
