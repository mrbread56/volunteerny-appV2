const fs = require('fs');
let content = fs.readFileSync('src/pages/Signup.tsx', 'utf8');

const catchRegex = /\}\)\.catch\(\(err: any\) => \{\n\s*setIsGoogleLoading\(false\);\n\s*console\.error\("Google Auth Error:", err\);\n\s*setError\("Error: " \+ err\.code \+ " - " \+ \(err\.message \|\| "Could not sign in with Google\."\)\);\n\s*\}\);/g;

const newCatch = `}).catch((err: any) => {
      setIsGoogleLoading(false);
      console.error("Google Auth Error:", err);
      if (err.code !== 'auth/internal-error' && !err.message?.includes('internal-error')) {
        setError("Error: " + err.code + " - " + (err.message || "Could not sign in with Google."));
      }
    });`;

if (content.match(catchRegex)) {
  content = content.replace(catchRegex, newCatch);
} else {
  console.log("Could not find catch block in Signup.tsx");
}

fs.writeFileSync('src/pages/Signup.tsx', content);
