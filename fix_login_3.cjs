const fs = require('fs');
let content = fs.readFileSync('src/pages/Login.tsx', 'utf8');

// Remove the forgot password button block
const buttonRegex = /<div className="flex justify-end !mt-1 py-1">[\s\S]*?<\/div>/m;
content = content.replace(buttonRegex, '');

fs.writeFileSync('src/pages/Login.tsx', content);
