const fs = require('fs');

let signup = fs.readFileSync('src/pages/Signup.tsx', 'utf8');

// Add sendEmailVerification to imports
signup = signup.replace(/createUserWithEmailAndPassword, updateProfile, signInWithPopup \}/, 'createUserWithEmailAndPassword, updateProfile, signInWithPopup, sendEmailVerification }');

// Add sendEmailVerification call
signup = signup.replace(/setMfaVerified\(true, user\.uid\);/g, 'await sendEmailVerification(user);\n      setMfaVerified(true, user.uid);');

fs.writeFileSync('src/pages/Signup.tsx', signup);
