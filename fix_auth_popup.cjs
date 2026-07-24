const fs = require('fs');

function fixLogin() {
  let content = fs.readFileSync('src/pages/Login.tsx', 'utf8');

  // Change import
  content = content.replace(/signInWithRedirect, getRedirectResult, /, "signInWithPopup, ");

  // Remove getRedirectResult block
  const redirectEffectRegex = /getRedirectResult\(auth\)\.then\(async \(cred\) => {[\s\S]*?\}\);/g;
  content = content.replace(redirectEffectRegex, "/* redirect check removed */");

  // Rewrite handleGoogleLogin
  const handleGoogleLoginRegex = /const handleGoogleLogin = async \(\) => {[\s\S]*?  };/g;
  const newHandleGoogleLogin = `const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    setError("");
    try {
      const cred = await signInWithPopup(auth, googleProvider);
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
    } catch (err: any) {
      setIsGoogleLoading(false);
      console.error("Popup Error:", err);
      setError("Error: " + err.code + " - " + err.message);
    }
  };`;
  content = content.replace(handleGoogleLoginRegex, newHandleGoogleLogin);

  // Remove isIframe block around Button
  const isIframeRegex = /\{!isIframe && \(\s*(<Button[\s\S]*?Sign in with Google\s*<\/Button>)\s*\)\}/g;
  content = content.replace(isIframeRegex, "$1");
  const isIframeDividerRegex = /\{!isIframe && \(\s*(<div className="relative">[\s\S]*?<\/div>\s*<\/div>)\s*\)\}/g;
  content = content.replace(isIframeDividerRegex, "$1");
  
  // Also remove the "Google Sign-In is blocked inside this preview window" message
  const warningMsgRegex = /\{isIframe && \([\s\S]*?<\/div>\s*\)\}/g;
  content = content.replace(warningMsgRegex, "");

  fs.writeFileSync('src/pages/Login.tsx', content);
}

function fixSignup() {
  let content = fs.readFileSync('src/pages/Signup.tsx', 'utf8');

  // Change import
  content = content.replace(/signInWithRedirect, getRedirectResult, /, "signInWithPopup, ");

  // Remove getRedirectResult block
  const redirectEffectRegex = /getRedirectResult\(auth\)\.then\(async \(result\) => {[\s\S]*?\}\);/g;
  content = content.replace(redirectEffectRegex, "/* redirect check removed */");

  // Rewrite handleGoogleSignup
  const handleGoogleSignupRegex = /const handleGoogleSignup = async \(\) => {[\s\S]*?  };/g;
  const newHandleGoogleSignup = `const handleGoogleSignup = async () => {
    if (!role) {
      setError("Please select a role first before signing up with Google.");
      return;
    }
    setIsGoogleLoading(true);
    setError("");
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (result) {
        const user = result.user;
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        
        let targetRole = role;
        
        if (!userDocSnap.exists()) {
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
          try {
            await sendEmailVerification(user);
          } catch(e) {}
        }
        
        setMfaVerified(true, user.uid);
        await refreshProfile();
        navigate("/");
      }
      setIsGoogleLoading(false);
    } catch (err: any) {
      setIsGoogleLoading(false);
      console.error("Popup Error:", err);
      setError("Error: " + err.code + " - " + err.message);
    }
  };`;
  content = content.replace(handleGoogleSignupRegex, newHandleGoogleSignup);

  // Remove isIframe block around Button
  const isIframeRegex = /\{!isIframe && \(\s*(<Button[\s\S]*?Sign up with Google\s*<\/Button>)\s*\)\}/g;
  content = content.replace(isIframeRegex, "$1");
  const isIframeDividerRegex = /\{!isIframe && \(\s*(<div className="relative py-2">[\s\S]*?<\/div>\s*<\/div>)\s*\)\}/g;
  content = content.replace(isIframeDividerRegex, "$1");
  
  // Also remove the "Google Sign-In is blocked inside this preview window" message
  const warningMsgRegex = /\{isIframe && \([\s\S]*?<\/div>\s*\)\}/g;
  content = content.replace(warningMsgRegex, "");

  fs.writeFileSync('src/pages/Signup.tsx', content);
}

fixLogin();
fixSignup();
