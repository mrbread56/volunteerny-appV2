const fs = require('fs');

let content = fs.readFileSync('src/pages/Signup.tsx', 'utf8');

const targetPoint = '  const { refreshProfile, enableDemoMode, setMfaVerified } = useAuth();\n';

const useEffectBlock = `
  React.useEffect(() => {
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
          try {
            await sendEmailVerification(user);
          } catch(e) {}
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
      } else {
        setError("Error: " + err.code + " - " + (err.message || "Could not sign in with Google."));
      }
    });
  }, []);
`;

if (!content.includes('getRedirectResult(auth).then')) {
  content = content.replace(targetPoint, targetPoint + useEffectBlock);
  fs.writeFileSync('src/pages/Signup.tsx', content);
}

