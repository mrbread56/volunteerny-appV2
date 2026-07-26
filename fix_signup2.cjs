const fs = require('fs');
let content = fs.readFileSync('src/pages/Signup.tsx', 'utf8');

content = content.replace(/React\.\s*const startSignupVerification/, 'const startSignupVerification');

// also remove `isGoogleLoading` error if it pops up later
content = content.replace(/const \[isGoogleLoading, setIsGoogleLoading\] = useState\(false\);/, '');

fs.writeFileSync('src/pages/Signup.tsx', content);
