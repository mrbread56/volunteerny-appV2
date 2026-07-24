const fs = require('fs');
let content = fs.readFileSync('src/pages/Signup.tsx', 'utf8');

const uiRegex = /<Button\n\s*className="w-full h-18 text-xl font-black uppercase tracking-widest rounded-3xl transition-all shadow-2xl bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200 cursor-pointer"\n\s*onClick=\{([^}]*)\}\n\s*>\n\s*Ready to continue\n\s*<\/Button>/g;

const newUi = `<Button
                  className="w-full h-18 text-xl font-black uppercase tracking-widest rounded-3xl transition-all shadow-2xl bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200 cursor-pointer"
                  onClick={handleGoogleSignup}
                  isLoading={isGoogleLoading}
                >
                  <svg className="w-6 h-6 mr-4" viewBox="0 0 24 24">
                    <path
                      fill="#ffffff"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#ffffff"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#ffffff"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                    />
                    <path
                      fill="#ffffff"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Sign up with Google
                </Button>
                <Button
                  variant="outline"
                  className="w-full h-18 text-sm font-black uppercase tracking-widest rounded-3xl transition-all border-slate-200 text-slate-700 bg-white hover:bg-slate-50 shadow-inner cursor-pointer"
                  onClick={() => setSetupStage("form")}
                >
                  Continue with Email & Password
                </Button>`;

if (content.match(uiRegex)) {
  content = content.replace(uiRegex, newUi);
} else {
  console.log("Failed to match UI regex.");
}

// Now insert handleGoogleSignup before return
const renderRegex = /if \(setupStage === "role-select" \|\| !role\) \{/g;
const googleSignupCode = `
  const handleGoogleSignup = async () => {
    setIsGoogleLoading(true);
    setError("");
    try {
      const { signInWithPopup } = await import("firebase/auth");
      const result = await signInWithPopup(auth, googleProvider);
      if (result && result.user) {
        const user = result.user;
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        
        let targetRole = role || "student";
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
        }
        setMfaVerified(true, user.uid);
        await refreshProfile();
        navigate("/");
      }
    } catch (err: any) {
      console.error("Google Auth Error:", err);
      if (err.code === "auth/popup-closed-by-user") {
        setError("Sign-in popup was closed before completing.");
      } else if (err.code === "auth/internal-error" || err.message?.includes("internal-error")) {
        setError("INTERNAL ERROR: 1. Ensure you are opening the app in a NEW TAB (arrow icon top right). 2. Ensure third-party cookies are enabled. 3. Ensure " + window.location.hostname + " is in Authorized domains.");
      } else {
        setError(\`Sign up failed: \${err.code || 'Unknown Error'} - \${err.message}\`);
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  if (setupStage === "role-select" || !role) {`;

if (content.match(renderRegex)) {
  content = content.replace(renderRegex, googleSignupCode);
} else {
  console.log("Failed to match render regex.");
}

fs.writeFileSync('src/pages/Signup.tsx', content);
console.log("Success Signup");
