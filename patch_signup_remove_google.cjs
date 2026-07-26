const fs = require('fs');
let content = fs.readFileSync('src/pages/Signup.tsx', 'utf8');

// Remove Google imports
content = content.replace('import { signInWithCredential, GoogleAuthProvider } from "firebase/auth";', '');

// Remove handleGoogleSignup
const handleGoogleSignupRegex = /const handleGoogleSignup = async \(\) => \{[\s\S]*?catch \(err: any\) \{[\s\S]*?setIsGoogleLoading\(false\);[\s\S]*?setError\(err\.message\);[\s\S]*?\}[\s\S]*?\};/;
content = content.replace(handleGoogleSignupRegex, '');

// Remove useEffect for handleMessage (Google Auth Relay)
const useEffectRegex = /useEffect\(\(\) => \{[\s\S]*?const handleMessage = async \(event: MessageEvent\) => \{[\s\S]*?window\.removeEventListener\('message', handleMessage\);[\s\S]*?\}, \[role, navigate, refreshProfile, setMfaVerified\]\);/;
content = content.replace(useEffectRegex, '');

// Remove Google Button
const googleButtonRegex = /<Button\s+className="w-full h-18 text-sm font-black uppercase tracking-widest rounded-3xl transition-all shadow-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer mb-4"\s+onClick=\{handleGoogleSignup\}[\s\S]*?<\/svg>\s*Sign up with Google\s*<\/Button>/;
content = content.replace(googleButtonRegex, '');

fs.writeFileSync('src/pages/Signup.tsx', content);
