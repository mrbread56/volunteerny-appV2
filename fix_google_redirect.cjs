const fs = require('fs');

function fixLogin(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(
    'import { signInWithEmailAndPassword, signInWithPopup, signOut, sendPasswordResetEmail } from "firebase/auth";',
    'import { signInWithEmailAndPassword, signInWithRedirect, getRedirectResult, signOut, sendPasswordResetEmail } from "firebase/auth";'
  );
  
  // Find where it's used
  content = content.replace(
    'const cred = await signInWithPopup(auth, googleProvider);',
    'await signInWithRedirect(auth, googleProvider); return;'
  );

  const useEffectBlock = `
  useEffect(() => {
    setIsGoogleLoading(true);
    getRedirectResult(auth).then(async (cred) => {
      if (cred) {
        const user = cred.user;
        let has2FA = false;
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) {
            const uData = userDoc.data();
            if (uData && typeof uData.twoFactorEnabled !== "undefined") {
              has2FA = uData.twoFactorEnabled;
            }
          }
        } catch (err) {
          console.warn("Could not check google user 2FA status:", err);
        }
        if (has2FA) {
          triggerMFA(user.email || "", user.displayName || user.email?.split("@")[0] || "User");
        } else {
          setMfaVerified(true, user.uid);
          await refreshProfile();
          navigate("/");
        }
      }
      setIsGoogleLoading(false);
    }).catch((err: any) => {
      setIsGoogleLoading(false);
      console.error("Google Auth Error:", err);
      if (err.code === "auth/operation-not-allowed") {
        setError('FIREBASE SETUP REQUIRED: Open Firebase Console > Authentication > "Get Started" > "Sign-in method". Enable Google provider. Set a support email.');
      } else if (err.code === "auth/unauthorized-domain") {
        setError('DOMAIN BLOCKED: Add ' + window.location.hostname + ' to Firebase Console > Authentication > Settings > Authorized domains.');
      } else {
        setError("Error: " + err.code + " - " + (err.message || "Could not sign in with Google."));
      }
    });
  }, []);
`;
  
  content = content.replace(
    '// Auto-redirect if already fully authenticated & verified\n  useEffect(() => {',
    useEffectBlock + '\n  // Auto-redirect if already fully authenticated & verified\n  useEffect(() => {'
  );

  fs.writeFileSync(filePath, content);
}

fixLogin('src/pages/Login.tsx');

function fixSignup(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(
    'import { createUserWithEmailAndPassword, updateProfile, signInWithPopup, sendEmailVerification } from "firebase/auth";',
    'import { createUserWithEmailAndPassword, updateProfile, signInWithRedirect, getRedirectResult, sendEmailVerification } from "firebase/auth";'
  );
  
  content = content.replace(
    'const result = await signInWithPopup(auth, googleProvider);',
    'await signInWithRedirect(auth, googleProvider); return;'
  );

  const useEffectBlock = `
  useEffect(() => {
    setIsGoogleLoading(true);
    getRedirectResult(auth).then(async (result) => {
      if (result) {
        const user = result.user;
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (!userDocSnap.exists()) {
          await setDoc(userDocRef, {
            uid: user.uid,
            email: user.email,
            role: "student",
            createdAt: new Date(),
            twoFactorEnabled: false
          });
        }
        await sendEmailVerification(user);
        setMfaVerified(true, user.uid);
        await refreshProfile();
        navigate("/");
      }
      setIsGoogleLoading(false);
    }).catch((err: any) => {
      setIsGoogleLoading(false);
      console.error("Google Auth Error:", err);
      if (err.code === "auth/operation-not-allowed") {
        setError('FIREBASE SETUP REQUIRED: Open Firebase Console > Authentication > "Get Started" > "Sign-in method". Enable Google provider. Set a support email.');
      } else if (err.code === "auth/unauthorized-domain") {
        setError('DOMAIN BLOCKED: Add ' + window.location.hostname + ' to Firebase Console > Authentication > Settings > Authorized domains.');
      } else {
        setError("Error: " + err.code + " - " + (err.message || "Could not sign in with Google."));
      }
    });
  }, []);
`;
  
  content = content.replace(
    '// Check authentication state on mount',
    useEffectBlock + '\n  // Check authentication state on mount'
  );

  fs.writeFileSync(filePath, content);
}

fixSignup('src/pages/Signup.tsx');
