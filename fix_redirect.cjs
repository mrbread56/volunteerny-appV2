const fs = require('fs');

// --- Login.tsx ---
let loginContent = fs.readFileSync('src/pages/Login.tsx', 'utf8');

loginContent = loginContent.replace(
  /import \{ signInWithEmailAndPassword, signInWithPopup, signOut, sendPasswordResetEmail \} from "firebase\/auth";/,
  'import { signInWithEmailAndPassword, signInWithRedirect, getRedirectResult, signOut, sendPasswordResetEmail } from "firebase/auth";'
);

const loginEffect = `  // Handle the return from Google Redirect
  useEffect(() => {
    const checkRedirect = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result && result.user) {
          const user = result.user;
          let has2FA = true;
          try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
              const uData = userDoc.data();
              if (uData && typeof uData.twoFactorEnabled !== "undefined") {
                has2FA = uData.twoFactorEnabled;
              }
            } else {
              has2FA = false; // New user, no 2FA yet
            }
          } catch (e) {}
          if (has2FA) {
            triggerMFA(user.email || "", user.displayName || user.email?.split("@")[0] || "User");
          } else {
            setMfaVerified(true, user.uid);
            await refreshProfile();
            navigate("/");
          }
        }
      } catch (err: any) {
        console.error("Redirect Auth Error:", err);
        setError("Google Login Failed: " + err.message);
      } finally {
        setIsGoogleLoading(false);
      }
    };
    checkRedirect();
  }, []);
`;

loginContent = loginContent.replace(/const triggerMFA = async \(/, loginEffect + '\n  const triggerMFA = async (');

const handleGoogleLoginRegex = /const handleGoogleLogin = async \(\) => \{[\s\S]*?\}\n  \};\n/g;
const newHandleGoogleLogin = `const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    setError("");
    try {
      await signInWithRedirect(auth, googleProvider);
      // The page will immediately redirect to Google.
    } catch (err: any) {
      setIsGoogleLoading(false);
      setError("Error initiating Google sign-in: " + err.message);
    }
  };
`;
loginContent = loginContent.replace(handleGoogleLoginRegex, newHandleGoogleLogin);
fs.writeFileSync('src/pages/Login.tsx', loginContent);


// --- Signup.tsx ---
let signupContent = fs.readFileSync('src/pages/Signup.tsx', 'utf8');

signupContent = signupContent.replace(
  /import \{ createUserWithEmailAndPassword, signInWithPopup, sendEmailVerification \} from "firebase\/auth";/,
  'import { createUserWithEmailAndPassword, signInWithRedirect, getRedirectResult, sendEmailVerification } from "firebase/auth";'
);

const signupEffect = `  // Handle the return from Google Redirect
  useEffect(() => {
    const checkRedirect = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result && result.user) {
          const user = result.user;
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) {
            setMfaVerified(true);
            await refreshProfile();
            navigate("/");
            return;
          }
          // If no role was selected before redirect, default to student or handle gracefully
          const currentRole = role || "student"; 
          await setDoc(doc(db, "users", user.uid), {
            uid: user.uid,
            email: user.email,
            role: currentRole,
            twoFactorEnabled: true,
            createdAt: serverTimestamp(),
          });
          if (currentRole === "student") {
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
          navigate(currentRole === "student" ? "/student/onboarding" : "/org/profile");
        }
      } catch (err: any) {
        console.error("Redirect Auth Error:", err);
        setError("Google Signup Failed: " + err.message);
      } finally {
        setIsGoogleLoading(false);
      }
    };
    checkRedirect();
  }, []);
`;

signupContent = signupContent.replace(/const handleGoogleSignup = async \(\) => \{/, signupEffect + '\n  const handleGoogleSignup = async () => {');

const handleGoogleSignupRegex = /const handleGoogleSignup = async \(\) => \{[\s\S]*?\}\n  \};\n/g;
const newHandleGoogleSignup = `const handleGoogleSignup = async () => {
    if (!role) {
      setError("Please select a role first before signing up with Google.");
      return;
    }
    setIsGoogleLoading(true);
    setError("");
    try {
      await signInWithRedirect(auth, googleProvider);
      // The page will immediately redirect to Google.
    } catch (err: any) {
      setIsGoogleLoading(false);
      setError("Error initiating Google sign-up: " + err.message);
    }
  };
`;
signupContent = signupContent.replace(handleGoogleSignupRegex, newHandleGoogleSignup);

fs.writeFileSync('src/pages/Signup.tsx', signupContent);
