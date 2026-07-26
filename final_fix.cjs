const fs = require('fs');

function fixLogin() {
  let content = fs.readFileSync('src/pages/Login.tsx', 'utf8');

  // Fix the empty effect
  const emptyEffectRegex = /useEffect\(\(\) => \{\n\s*setIsGoogleLoading\(true\);\n\s*\/\* redirect check removed \*\/\n\s*\}, \[\]\);/g;
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

fixLogin();
