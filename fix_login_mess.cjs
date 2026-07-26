const fs = require('fs');
let content = fs.readFileSync('src/pages/Login.tsx', 'utf8');

const regex = /useEffect\(\(\) => \{\n    setIsGoogleLoading\(true\);\n    \/\* redirect check removed \*\/[\s\S]*?      \}\n    \}\);\n  \}, \[\]\);/g;

content = content.replace(regex, `  useEffect(() => {\n    // redirect check removed\n  }, []);`);

fs.writeFileSync('src/pages/Login.tsx', content);
