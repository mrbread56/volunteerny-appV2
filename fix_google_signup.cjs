const fs = require('fs');

function fixSignup(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Replace handleGoogleSignup fully
  const regex = /const handleGoogleSignup = async \(\) => \{[\s\S]*?setIsGoogleLoading\(false\);\n    \}\n  \};\n/g;
  
  content = content.replace(regex, `const handleGoogleSignup = async () => {
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
  };\n`);

  // Update the useEffect logic to use pending_signup_role
  const oldEffect = /getRedirectResult\(auth\)\.then\(async \(result\) => \{[\s\S]*?navigate\("\/"\);\n      \}\n      setIsGoogleLoading\(false\);\n    \}\)/;
  
  const newEffect = `getRedirectResult(auth).then(async (result) => {
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
          await sendEmailVerification(user);
        }
        
        localStorage.removeItem("pending_signup_role");
        setMfaVerified(true, user.uid);
        await refreshProfile();
        navigate("/");
      }
      setIsGoogleLoading(false);
    })`;
  
  content = content.replace(oldEffect, newEffect);

  fs.writeFileSync(filePath, content);
}

fixSignup('src/pages/Signup.tsx');

function fixLogin(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Replace handleGoogleLogin fully
  const regex = /const handleGoogleLogin = async \(\) => \{[\s\S]*?setIsGoogleLoading\(false\);\n    \}\n  \};\n/g;
  
  content = content.replace(regex, `const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    setError("");
    try {
      await signInWithRedirect(auth, googleProvider);
    } catch (err: any) {
      setIsGoogleLoading(false);
      console.error("Redirect Error:", err);
      setError("Error: " + err.code + " - " + err.message);
    }
  };\n`);

  fs.writeFileSync(filePath, content);
}

fixLogin('src/pages/Login.tsx');
