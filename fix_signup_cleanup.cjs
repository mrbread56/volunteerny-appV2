const fs = require('fs');
let content = fs.readFileSync('src/pages/Signup.tsx', 'utf8');

// Remove getRedirectResult effect entirely
const effectRegex = /React\.useEffect\(\(\) => \{\n\s*setIsGoogleLoading\(true\);\n\s*getRedirectResult\(auth\)[\s\S]*?\}\);\n\s*\}, \[\]\);/g;
content = content.replace(effectRegex, '');

// If there are any stray setIsGoogleLoading(false) or true, we shouldn't worry too much as long as they aren't blocking. 
// But let's check if the component actually has `isGoogleLoading` blocking rendering
fs.writeFileSync('src/pages/Signup.tsx', content);
