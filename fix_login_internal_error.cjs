const fs = require('fs');
let content = fs.readFileSync('src/pages/Login.tsx', 'utf8');

const catchRegex = /\} catch \(err: any\) \{\n\s*console\.error\("Google Login Error:", err\);\n\s*if \(err\.code === "auth\/popup-closed-by-user"\) \{[\s\S]*?\} else \{\n\s*setError\(`Login Failed: \$\{err\.code \|\| 'Unknown Error'\} - \$\{err\.message\}`\);\n\s*\}/g;

const newCatch = `} catch (err: any) {
      console.error("Google Login Error:", err);
      if (err.code === "auth/popup-closed-by-user") {
        setError("Sign-in popup was closed before completing.");
      } else if (err.code === "auth/internal-error" || err.message?.includes("internal-error")) {
        setError("INTERNAL ERROR: 1. Ensure you are opening the app in a NEW TAB (arrow icon top right). 2. Ensure third-party cookies are enabled. 3. Ensure " + window.location.hostname + " is in Authorized domains.");
      } else {
        setError(\`Login Failed: \${err.code || 'Unknown Error'} - \${err.message}\`);
      }`;

if (content.match(catchRegex)) {
  content = content.replace(catchRegex, newCatch);
  fs.writeFileSync('src/pages/Login.tsx', content);
  console.log("Success");
} else {
  console.log("Failed to match regex");
}
