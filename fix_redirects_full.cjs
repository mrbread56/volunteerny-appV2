const fs = require('fs');

function fixLogin() {
  let content = fs.readFileSync('src/pages/Login.tsx', 'utf8');

  // Fix imports
  content = content.replace(/import \{ signInWithEmailAndPassword, signInWithRedirect, signOut, sendPasswordResetEmail \} from "firebase\/auth";/g, 'import { signInWithEmailAndPassword, signInWithRedirect, getRedirectResult, signOut, sendPasswordResetEmail } from "firebase/auth";');
  if (!content.includes('getRedirectResult')) {
     content = content.replace(/signInWithRedirect, signOut/, "signInWithRedirect, getRedirectResult, signOut");
  }

  // Rewrite handleGoogleLogin
  const handleGoogleLoginRegex = /const handleGoogleLogin = async \(\) => {[\s\S]*?  };/g;
  const newHandleGoogleLogin = `const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    setError("");
    try {
      await signInWithRedirect(auth, googleProvider);
    } catch (err: any) {
      setIsGoogleLoading(false);
      console.error("Redirect Error:", err);
      setError("Error: " + err.code + " - " + err.message);
    }
  };`;
  content = content.replace(handleGoogleLoginRegex, newHandleGoogleLogin);

  // Replace empty effect
  const emptyEffectRegex = /useEffect\(\(\) => \{\n    \/\/ redirect check removed\n  \}, \[\]\);/g;
  const newEffect = `useEffect(() => {
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
          setStep("mfa");
          setIsDemoMfa(false);
          if (!hasCodeSentRef.current && user.email) {
            hasCodeSentRef.current = true;
            triggerMFA(user.email, user.displayName || user.email.split("@")[0] || "User");
          }
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
      } else if (err.code === "auth/internal-error" || err.message?.includes("internal-error")) {
        setError("INTERNAL ERROR: 1. Ensure you are opening the app in a NEW TAB (arrow icon top right). 2. Ensure third-party cookies are enabled in your browser. 3. Check that your Firebase API Key is not restricted. 4. Ensure you set a Support Email in Firebase Project Settings.");
      } else {
        setError("Error: " + err.code + " - " + (err.message || "Could not sign in with Google."));
      }
    });
  }, []);`;
  content = content.replace(emptyEffectRegex, newEffect);

  fs.writeFileSync('src/pages/Login.tsx', content);
}

function fixSignup() {
  let content = fs.readFileSync('src/pages/Signup.tsx', 'utf8');

  // Fix imports
  content = content.replace(/signInWithPopup/g, "signInWithRedirect");
  if (!content.includes('getRedirectResult')) {
    content = content.replace(/signInWithRedirect, sendEmailVerification/, "signInWithRedirect, getRedirectResult, sendEmailVerification");
  }

  // Rewrite handleGoogleSignup
  const handleGoogleSignupRegex = /const handleGoogleSignup = async \(\) => {[\s\S]*?  };/g;
  const newHandleGoogleSignup = `const handleGoogleSignup = async () => {
    if (!role) {
      setError("Please select a role first before signing up with Google.");
      return;
    }
    localStorage.setItem("pending_signup_role", role);
    setIsGoogleLoading(true);
    setError("");
    try {
      await signInWithRedirect(auth, googleProvider);
    } catch (err: any) {
      setIsGoogleLoading(false);
      console.error("Redirect Error:", err);
      setError("Error: " + err.code + " - " + err.message);
    }
  };`;
  content = content.replace(handleGoogleSignupRegex, newHandleGoogleSignup);

  // Replace empty effect
  const emptyEffectRegex = /React\.useEffect\(\(\) => \{\n    \/\/ redirect check removed\n  \}, \[\]\);/g;
  const newEffect = `React.useEffect(() => {
    setIsGoogleLoading(true);
    getRedirectResult(auth).then(async (result) => {
      if (result) {
        const user = result.user;
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        
        let targetRole = "student";
        if (!userDocSnap.exists()) {
          const storedRole = localStorage.getItem("pending_signup_role");
          if (storedRole) targetRole = storedRole;
          
          await setDoc(userDocRef, {
            uid: user.uid,
            email: user.email,
            role: targetRole,
            createdAt: new Date(),
            twoFactorEnabled: false
          });
          
          if (targetRole === "student") {
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
        }
        
        localStorage.removeItem("pending_signup_role");
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
      } else if (err.code === "auth/internal-error" || err.message?.includes("internal-error")) {
        setError("INTERNAL ERROR: 1. Ensure you are opening the app in a NEW TAB (arrow icon top right). 2. Ensure third-party cookies are enabled in your browser. 3. Check that your Firebase API Key is not restricted. 4. Ensure you set a Support Email in Firebase Project Settings.");
      } else {
        setError("Error: " + err.code + " - " + (err.message || "Could not sign in with Google."));
      }
    });
  }, []);`;
  content = content.replace(emptyEffectRegex, newEffect);

  fs.writeFileSync('src/pages/Signup.tsx', content);
}

fixLogin();
fixSignup();
