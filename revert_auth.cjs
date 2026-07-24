const fs = require('fs');

// --- 1. src/firebase/config.ts ---
fs.writeFileSync('src/firebase/config.ts', `import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
const app = initializeApp(firebaseConfig);
// Use the database ID from the config
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
// CRITICAL: Connection test for Firestore
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Please check your Firebase configuration. The client is offline.");
    }
  }
}
testConnection();
export default app;
`);

// --- 2. src/pages/Login.tsx ---
let loginContent = fs.readFileSync('src/pages/Login.tsx', 'utf8');
loginContent = loginContent.replace(
  /import \{ signInWithEmailAndPassword[^}]*\} from "firebase\/auth";/,
  'import { signInWithEmailAndPassword, signInWithPopup, signOut, sendPasswordResetEmail } from "firebase/auth";'
);
loginContent = loginContent.replace(/const isIframe = window !== window\.top;\n\s*/g, '');

const handleGoogleLoginRegex = /const handleGoogleLogin = async \(\) => \{[\s\S]*?\n  \};\n/g;
const newHandleGoogleLogin = `const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    setError("");
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const user = cred.user;
      let has2FA = true;
      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const uData = userDoc.data();
          if (uData && typeof uData.twoFactorEnabled !== "undefined") {
            has2FA = uData.twoFactorEnabled;
          }
        } else {
          has2FA = false;
        }
      } catch (err) {
        console.warn("Could not check google user 2FA status:", err);
      }
      if (has2FA) {
        await triggerMFA(user.email || "", user.displayName || user.email?.split("@")[0] || "User");
      } else {
        setMfaVerified(true, user.uid);
        await refreshProfile();
        navigate("/");
      }
    } catch (err: any) {
      if (err.code === "auth/operation-not-allowed") {
        setError(
          'GOOGLE DISABLED: Open Firebase Console > Authentication > "Sign-in method" tab. Click "Add new provider" and enable "Google". You must also set a support email and public-facing name.',
        );
      } else if (err.code === "auth/unauthorized-domain") {
        setError(
          'DOMAIN BLOCKED: Open Firebase Console > Authentication > "Settings" tab > "Authorized domains". Click "Add domain" and enter: ' +
            window.location.hostname,
        );
      } else if (err.code === "auth/popup-blocked") {
        setError(
          "The sign-in popup was blocked. Please allow popups for this site.",
        );
      } else {
        setError(err.message || "Error signing in with Google");
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };
`;
loginContent = loginContent.replace(handleGoogleLoginRegex, newHandleGoogleLogin);
fs.writeFileSync('src/pages/Login.tsx', loginContent);


// --- 3. src/pages/Signup.tsx ---
let signupContent = fs.readFileSync('src/pages/Signup.tsx', 'utf8');
signupContent = signupContent.replace(
  /import \{ createUserWithEmailAndPassword[^}]*\} from "firebase\/auth";/,
  'import { createUserWithEmailAndPassword, signInWithPopup, sendEmailVerification } from "firebase/auth";'
);
signupContent = signupContent.replace(/const isIframe = window !== window\.top;\n\s*/g, '');

const handleGoogleSignupRegex = /const handleGoogleSignup = async \(\) => \{[\s\S]*?\}\n  \};\n/g;
const newHandleGoogleSignup = `const handleGoogleSignup = async () => {
    if (!role) {
      setError("Please select a role first before signing up with Google.");
      return;
    }
    setIsGoogleLoading(true);
    setError("");
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      if (!auth.currentUser) {
        throw new Error(
          "Unable to establish authentication state. Please try again.",
        );
      }
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        setMfaVerified(true);
        await refreshProfile();
        navigate("/");
        return;
      }
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        email: user.email,
        role,
        twoFactorEnabled: true,
        createdAt: serverTimestamp(),
      });
      if (role === "student") {
        await setDoc(doc(db, "students", user.uid), {
          uid: user.uid,
          fullName: user.displayName || "",
          school: "",
          grade: "",
          neighborhood: "",
          interests: [],
          skills: [],
          availability: [],
        });
      } else {
        await setDoc(doc(db, "organizations", user.uid), {
          uid: user.uid,
          organizationName: user.displayName || "",
          mission: "",
          contactEmail: user.email || "",
          phone: "",
          northYorkConfirmed: false,
          websiteUrl: "",
        });
      }
      setMfaVerified(true);
      await refreshProfile();
      navigate(role === "student" ? "/student/onboarding" : "/org/profile");
    } catch (err: any) {
      if (err.code === "auth/operation-not-allowed") {
        setError(
          'GOOGLE DISABLED: Open Firebase Console > Authentication > "Sign-in method" tab. Enable "Google".',
        );
      } else if (err.code === "auth/popup-blocked") {
        setError("The sign-in popup was blocked. Please allow popups for this site.");
      } else {
        setError(err.message || "Error signing in with Google");
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };
`;

if (signupContent.match(handleGoogleSignupRegex)) {
    signupContent = signupContent.replace(handleGoogleSignupRegex, newHandleGoogleSignup);
} else {
    // If we can't find it, we might need to manually insert it
    console.log("Could not find handleGoogleSignup to replace, manual insert needed.");
}

// Add serverTimestamp to import if not present
if (!signupContent.includes('serverTimestamp')) {
    signupContent = signupContent.replace('getDoc, setDoc', 'getDoc, setDoc, serverTimestamp');
}

fs.writeFileSync('src/pages/Signup.tsx', signupContent);


// --- 4. server.ts ---
let serverContent = fs.readFileSync('server.ts', 'utf8');
serverContent = serverContent.replace(/res\.setHeader\('Cross-Origin-Opener-Policy', '[^']+'\);/, "res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');");
fs.writeFileSync('server.ts', serverContent);

