const fs = require('fs');
let content = fs.readFileSync('src/pages/Login.tsx', 'utf8');

// Replace standard imports
content = content.replace(/signInWithEmailAndPassword,\s*signInWithRedirect,\s*getRedirectResult,\s*signOut,\s*sendPasswordResetEmail/g, 'signInWithRedirect, getRedirectResult, signOut, signInWithCustomToken');
content = content.replace(/const \[password, setPassword\] = useState\(""\);/g, '');
content = content.replace(/const \[showForgotPassword, setShowForgotPassword\] = useState\(false\);/g, '');
content = content.replace(/const \[resetEmail, setResetEmail\] = useState\(""\);/g, '');
content = content.replace(/const \[resetSuccess, setResetSuccess\] = useState\(""\);/g, '');

const handleLoginReplacement = `  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          purpose: "login"
        })
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || "Failed to dispatch login verification code.");
        setIsLoading(false);
        return;
      }

      setMfaStep(true);
      setCooldown(30);
    } catch (err: any) {
      console.warn("Could not dispatch login verification PIN email:", err);
      setError(err.message || "Failed to send verification code. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };
`;
content = content.replace(/  const handleLogin = async \(e: React\.FormEvent\) => \{[\s\S]*?  const handleVerifyMfa = async \(e: React\.FormEvent\) => \{/m, handleLoginReplacement + '\n  const handleVerifyMfa = async (e: React.FormEvent) => {');

const handleVerifyMfaReplacement = `  const handleVerifyMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const codeString = mfaDigits.join("");
    if (codeString.length < 6) {
      setError("Please key in the entire 6-digit verification code.");
      setIsLoading(false);
      return;
    }

    try {
      // Call server to verify OTP code
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: codeString })
      });
      if (!response.ok) {
        const data = await response.json();
        setError(data.error || "Incorrect 6-digit confirmation security key. Please try again.");
        setIsLoading(false);
        return;
      }
      
      const data = await response.json();
      
      if (data.customToken) {
         await signInWithCustomToken(auth, data.customToken);
      }
      
      await refreshProfile();
      navigate("/");
    } catch (verifyErr: any) {
      setError(verifyErr.message || "OTP verification failed. Please try again.");
      setIsLoading(false);
    }
  };
`;
content = content.replace(/  const handleVerifyMfa = async \(e: React\.FormEvent\) => \{[\s\S]*?  const handlePasswordReset = async/m, handleVerifyMfaReplacement + '\n  const handlePasswordReset = async');

// Delete password reset function
content = content.replace(/  const handlePasswordReset = async[\s\S]*?  \};/m, '');

// Remove password input from render
content = content.replace(/<Input\s+id="login-password"[\s\S]*?\/>/m, '');
content = content.replace(/<div className="flex items-center justify-end mt-2">[\s\S]*?<\/div>/m, '');
content = content.replace(/<AnimatePresence>[\s\S]*?<\/AnimatePresence>/m, '');

fs.writeFileSync('src/pages/Login.tsx', content);
