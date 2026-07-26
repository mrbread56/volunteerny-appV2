const fs = require('fs');

// 1. Remove MFA from Login
let login = fs.readFileSync('src/pages/Login.tsx', 'utf8');

// Instead of rewriting the whole file, let's just make triggerMFA immediately bypass
login = login.replace(/const triggerMFA = async \(targetEmail: string, name: string\) => \{[\s\S]*?setStep\("mfa"\);\n  \};/g, 'const triggerMFA = async (targetEmail: string, name: string) => { setMfaVerified(true, auth.currentUser?.uid); await refreshProfile(); navigate("/"); };');

// In handleLogin, we already have:
// if (has2FA) { await triggerMFA(...); }
// Which will now just bypass it.

// Let's also remove the actual MFA view rendering if we want, or just leave it since it's unreachable.
// But to be clean, let's just make `has2FA = false` always in handleLogin.
login = login.replace(/let has2FA = true;/g, 'let has2FA = false;');

fs.writeFileSync('src/pages/Login.tsx', login);


// 2. Remove MFA from Signup
let signup = fs.readFileSync('src/pages/Signup.tsx', 'utf8');

// Replace handleSignup to skip MFA
signup = signup.replace(/setSignupStep\("mfa"\);/g, 'setMfaVerified(true, user.uid); await refreshProfile(); navigate("/");');
signup = signup.replace(/await triggerMFA\(email, fullName\);/g, '');

fs.writeFileSync('src/pages/Signup.tsx', signup);
