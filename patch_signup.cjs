const fs = require('fs');
let code = fs.readFileSync('src/pages/Signup.tsx', 'utf8');

// Replace standard imports if needed. We need createUserWithEmailAndPassword.
code = code.replace(/signInWithCustomToken, signInWithRedirect, getRedirectResult, sendEmailVerification/, 'createUserWithEmailAndPassword, signInWithRedirect, getRedirectResult, sendEmailVerification');

// We will regex replace from `const [signupStep, setSignupStep] = useState<"form" | "mfa">("form");`
// down to the end of `handleVerifyMfa`.

const startIndex = code.indexOf('const [signupStep, setSignupStep] = useState<"form" | "mfa">("form");');
const endHandleVerify = code.indexOf('} finally {', code.indexOf('const handleVerifyMfa = async')) + '    }\n  };\n'.length;

const stateReplacement = `
  const [password, setPassword] = useState("");
`;

const handleSignupReplacement = `
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!role) return;

    if (role === "organization") {
      if (craNumber) {
        const cleanCra = craNumber.replace(/[\\s-]/g, "").toUpperCase();
        const craPattern = /^\\d{9}[A-Z]{2}\\d{4}$/;
        if (!craPattern.test(cleanCra)) {
          setError("Invalid Canada Revenue Agency Registration Number. Must match format: 9 digits + 2 letters + 4 digits (e.g., 123456789RR0001).");
          setIsLoading(false);
          return;
        }
      }
    }

    if (!consent) {
      setError("Please agree to our Terms and Privacy Policy.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 1. Create entry in 'users' collection
      try {
        await setDoc(doc(db, "users", user.uid), {
          uid: user.uid,
          email,
          role,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, \`users/\${user.uid}\`);
      }

      // 2. Create entry in specific profile collection
      try {
        if (role === "student") {
          await setDoc(doc(db, "students", user.uid), {
            uid: user.uid,
            fullName,
            school,
            grade,
            neighborhood,
            interests: selectedInterests,
            skills: selectedSkills,
            availability: selectedAvailability,
            resumeUrl: "",
            passportUrl: "",
          });
        } else {
          await setDoc(doc(db, "organizations", user.uid), {
            uid: user.uid,
            organizationName: orgName,
            mission,
            organizationType: orgType,
            address,
            coordinates: coords,
            contactEmail: contactEmail || email,
            phone,
            northYorkConfirmed: isNorthYork,
            websiteUrl: website,
            hasCra,
            craNumber: hasCra ? craNumber.replace(/[\\s-]/g, "").toUpperCase() : "",
            craVerified: hasCra ? true : false,
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, \`\${role}s/\${user.uid}\`);
      }

      await sendEmailVerification(user);
      await refreshProfile();

      // Dispatch registration email confirmations based on user type
      if (role === "student") {
        sendTransactionalEmail({
          to: email,
          subject: "Welcome to Volunteer North York! 🚀",
          templateName: "welcome_student",
          templateData: {
            studentName: fullName || "Student"
          }
        }).catch(err => console.error("Could not send student welcome email:", err));
      } else {
        sendTransactionalEmail({
          to: contactEmail || email,
          subject: \`Registering \${orgName || "Organization"} Succeeded!\`,
          templateName: "admin_alert",
          templateData: {
            subject: "Organization Registration Completed",
            details: \`The organization group "\${orgName || "Verified Partner"}" is pending administrator access activation.\`
          }
        }).catch(err => console.error("Could not send org verification setup email:", err));
      }

      navigate(role === "student" ? "/student/onboarding" : "/org/profile");
    } catch (err: any) {
      if (err.code === "auth/operation-not-allowed") {
        setError(
          'FIREBASE SETUP REQUIRED: Open Firebase Console > Authentication > "Get Started" (if you havent) > "Sign-in method" tab. Enable Email/Password.'
        );
      } else if (err.code === "auth/email-already-in-use") {
        setError(
          'This email is already in use. If you previously signed up with Google, please use the "Login with Google" button instead.'
        );
      } else if (err.code === "auth/weak-password") {
        setError("Password is too weak. Please use at least 6 characters.");
      } else if (err.code === "auth/invalid-email") {
        setError("Please enter a valid email address.");
      } else {
        setError(err.message || "Error creating account");
      }
    } finally {
      setIsLoading(false);
    }
  };
`;

// wait, we also have to delete `handleOtpChange`, `handleOtpKeyDown`, `handleResendCode`, `handleCancelMfa`, `startSignupVerification`, `handleVerifyMfa`.
// Let's just find the end of the `try {` block for `handleVerifyMfa` and cut there.
const deleteStart = code.indexOf('// 2-Step Verification layout states');
// find the end of `handleVerifyMfa` block
const endCatchBlock = code.indexOf('} finally {', code.indexOf('} catch (err: any) {', code.indexOf('const handleVerifyMfa')));
const deleteEnd = code.indexOf('};', endCatchBlock) + 2;

code = code.substring(0, deleteStart) + stateReplacement + code.substring(code.indexOf('// Form State'), code.indexOf('const handleOtpChange'));
code = code.substring(0, code.indexOf('const handleOtpChange')) + handleSignupReplacement + code.substring(deleteEnd);

// Also need to add Password input to the form and change onSubmit to handleSignup.
// Let's replace `onSubmit={startSignupVerification}` with `onSubmit={handleSignup}`.
code = code.replace(/onSubmit=\{startSignupVerification\}/g, 'onSubmit={handleSignup}');

// Need to inject password input right after email input.
const emailInputJSX = `<Input
                      label="Email Address"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder={role === "student" ? "student@example.com" : "contact@organization.org"}
                    />`;

const passwordInputJSX = `
                    <Input
                      label="Password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      placeholder="••••••••"
                      autoComplete="new-password"
                    />`;

code = code.replace(emailInputJSX, emailInputJSX + passwordInputJSX);

// We should remove the `AnimatePresence` and `signupStep === "form"` conditions.
// Or just let it be, but since `signupStep` is gone, it will be a compile error.
const animatePresenceRegex = /<AnimatePresence mode="wait">\s*\{signupStep === "form" \? \(/;
code = code.replace(animatePresenceRegex, "");

// Remove the `) : (` block that renders MFA UI.
const mfaBlockStart = code.indexOf(') : (');
const mfaBlockEnd = code.indexOf('</AnimatePresence>');
if (mfaBlockStart !== -1 && mfaBlockEnd !== -1) {
  code = code.substring(0, mfaBlockStart) + code.substring(mfaBlockEnd + '</AnimatePresence>'.length);
}

fs.writeFileSync('src/pages/Signup.tsx', code);
