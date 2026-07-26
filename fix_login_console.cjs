const fs = require('fs');
let content = fs.readFileSync('src/pages/Login.tsx', 'utf8');

const catchRegex = /\} catch \(err: any\) \{\n\s*console\.error\("Deep Redirect Error:", err\);/g;
const newCatch = `} catch (err: any) {
        // Suppress expected iframe block errors
        if (err.code !== 'auth/internal-error' && !err?.message?.includes('internal-error')) {
          console.error("Deep Redirect Error:", err);
        }`;

content = content.replace(catchRegex, newCatch);

fs.writeFileSync('src/pages/Login.tsx', content);
