const fs = require('fs');
let content = fs.readFileSync('src/pages/Signup.tsx', 'utf8');

const regex = /\}\)\.catch\(\(err: any\) => \{\n\s*setIsGoogleLoading\(false\);\n\s*console\.error\("Google Auth Error:", err\);\n\s*if \(err\.code === "auth\/operation-not-allowed"\) \{[\s\S]*?\} else if \(err\.code === "auth\/unauthorized-domain"\) \{[\s\S]*?\} else if \(err\.code === "auth\/internal-error" \|\| err\.message\?\.includes\("internal-error"\)\) \{[\s\S]*?\} else \{\n\s*setError\("Error: " \+ err\.code \+ " - " \+ \(err\.message \|\| "Could not sign in with Google\."\)\);\n\s*\}\n\s*\}\);/g;

const replacement = `}).catch((err: any) => {
      setIsGoogleLoading(false);
      console.error("Google Auth Error:", err);
      if (err.code === "auth/operation-not-allowed") {
        setError('FIREBASE SETUP REQUIRED: Open Firebase Console > Authentication > "Get Started" > "Sign-in method". Enable Google provider. Set a support email.');
      } else if (err.code === "auth/unauthorized-domain") {
        setError('DOMAIN BLOCKED: Add ' + window.location.hostname + ' to Firebase Console > Authentication > Settings > Authorized domains.');
      } else if (err.code === "auth/internal-error" || err.message?.includes("internal-error")) {
        // Suppress initial load error for blocked iframes
      } else {
        setError("Error: " + err.code + " - " + (err.message || "Could not sign in with Google."));
      }
    });`;

if (content.match(regex)) {
  content = content.replace(regex, replacement);
  console.log("Successfully replaced.");
} else {
  console.log("Still could not match.");
  // fall back to a looser match
  content = content.replace(/\s*\} else if \(err\.code === "auth\/internal-error" \|\| err\.message\?\.includes\("internal-error"\)\) \{[\s\S]*?\} else \{/g, 
  `} else if (err.code === "auth/internal-error" || err.message?.includes("internal-error")) {
        // Suppress initial load error for blocked iframes
      } else {`);
}

fs.writeFileSync('src/pages/Signup.tsx', content);
