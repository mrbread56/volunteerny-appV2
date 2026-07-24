const fs = require('fs');
let content = fs.readFileSync('src/pages/Signup.tsx', 'utf8');

content = content.replace(/              <Input\s+label="Password"\s+type="password"\s+value=\{password\}\s+onChange=\{\(e\) => setPassword\(e\.target\.value\)\}\s+required\s+minLength=\{8\}\s+placeholder="At least 8 characters"\s+autoComplete="new-password"\s+\/>/g, '');

content = content.replace(/password/g, '/* removed */');
fs.writeFileSync('src/pages/Signup.tsx', content);
