const fs = require('fs');
let content = fs.readFileSync('src/pages/Login.tsx', 'utf8');

const handleLoginCode = `  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      let recaptchaToken = "";
      try {
        recaptchaToken = await executeRecaptcha("login");
      } catch (err: any) {
        console.warn("reCAPTCHA execution failed, proceeding without it:", err);
      }
      const response = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          purpose: "login",
          recaptchaToken
        })
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || "Failed to dispatch login verification code.");
        setIsLoading(false);
        return;
      }

      setStep("mfa");
      setCooldown(30);
    } catch (err: any) {
      console.warn("Could not dispatch login verification PIN email:", err);
      setError(err.message || "Failed to send verification code. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };
`;

content = content.replace(/  const handleLogin = async \(e: React\.FormEvent\) => \{[\s\S]*?    \} finally \{\s*setIsLoading\(false\);\s*\}\s*\};/m, handleLoginCode);

fs.writeFileSync('src/pages/Login.tsx', content);
