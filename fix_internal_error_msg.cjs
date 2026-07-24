const fs = require('fs');

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  const oldCode = '} else if (err.code === "auth/unauthorized-domain") {\n        setError(\'DOMAIN BLOCKED: Add \' + window.location.hostname + \' to Firebase Console > Authentication > Settings > Authorized domains.\');\n      } else {';
  const newCode = '} else if (err.code === "auth/unauthorized-domain") {\n        setError(\'DOMAIN BLOCKED: Add \' + window.location.hostname + \' to Firebase Console > Authentication > Settings > Authorized domains.\');\n      } else if (err.code === "auth/internal-error" || err.message?.includes("internal-error")) {\n        setError("INTERNAL ERROR: 1. Ensure you are opening the app in a NEW TAB (arrow icon top right). 2. Ensure third-party cookies are enabled in your browser. 3. Check that your Firebase API Key is not restricted. 4. Ensure you set a Support Email in Firebase Project Settings.");\n      } else {';

  content = content.replace(oldCode, newCode);
  fs.writeFileSync(filePath, content);
}

fixFile('src/pages/Login.tsx');
fixFile('src/pages/Signup.tsx');
