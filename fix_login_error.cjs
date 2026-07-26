const fs = require('fs');

let content = fs.readFileSync('src/pages/Login.tsx', 'utf8');

const catchRegex = /\} catch \(err: any\) \{\n\s*console\.error\("Deep Redirect Error:", err\);\n\s*setError\(`Redirect Auth Failed: \$\{err\.code \|\| 'Unknown Error'\} - \$\{err\.message\}`\);\n\s*\} finally \{/g;

const newCatch = `} catch (err: any) {
        console.error("Deep Redirect Error:", err);
        // Do not block the UI on load if it's just the iframe blocking the redirect check
        if (err.code !== 'auth/internal-error' && !err.message?.includes('internal-error')) {
          setError(\`Redirect Auth Failed: \${err.code || 'Unknown Error'} - \${err.message}\`);
        }
      } finally {`;

content = content.replace(catchRegex, newCatch);

fs.writeFileSync('src/pages/Login.tsx', content);
