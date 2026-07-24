const fs = require('fs');

function fixSignup() {
  let content = fs.readFileSync('src/pages/Signup.tsx', 'utf8');
  
  const regex = /React\.useEffect\(\(\) => \{\n    setIsGoogleLoading\(true\);\n    \/\* redirect check removed \*\/[\s\S]*?      \}\n    \}\);\n  \}, \[\]\);/g;
  
  content = content.replace(regex, `
  React.useEffect(() => {
    // redirect check removed
  }, []);
  `);

  fs.writeFileSync('src/pages/Signup.tsx', content);
}

function fixLogin() {
  let content = fs.readFileSync('src/pages/Login.tsx', 'utf8');
  
  const regex = /useEffect\(\(\) => \{\n    \/\* redirect check removed \*\/[\s\S]*?\}\);\n  \}, \[\]\);/g;
  content = content.replace(regex, `
  useEffect(() => {
    // redirect check removed
  }, []);
  `);

  fs.writeFileSync('src/pages/Login.tsx', content);
}

fixSignup();
fixLogin();
