const fs = require('fs');

let content = fs.readFileSync('src/pages/Login.tsx', 'utf8');

const loginEffectRegex = /\/\/ 1\. Bulletproof Redirect Handler\n  useEffect\(\(\) => \{[\s\S]*?\}, \[\]\);/g;

const newLoginEffect = `// 1. Bulletproof Redirect Handler
  useEffect(() => {
    const checkRedirect = async () => {
      try {
        const result = await import("firebase/auth").then(m => m.getRedirectResult(auth));
        if (result && result.user) {
          // If successful redirect return, bypass MFA and log them in
          setMfaVerified(true, result.user.uid);
          await refreshProfile();
          navigate("/");
        }
      } catch (err: any) {
        console.error("Deep Redirect Error:", err);
        setError(\`Redirect Auth Failed: \${err.code || 'Unknown Error'} - \${err.message}\`);
      } finally {
        // ALWAYS turn off the loading state when the page finishes loading
        setIsGoogleLoading(false);
      }
    };
    checkRedirect();
  }, []);`;

content = content.replace(loginEffectRegex, newLoginEffect);

const clickHandlerRegex = /\/\/ 2\. Bulletproof Click Handler\n  const handleGoogleLogin = async \(\) => \{[\s\S]*?  \};/g;

const newClickHandler = `// 2. Bulletproof Click Handler
  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    setError("");
    try {
      const { signInWithRedirect } = await import("firebase/auth");
      
      // We set a 3-second timeout. If the browser blocks the redirect, 
      // the page won't unload, and this timeout will catch the silent failure!
      setTimeout(() => {
        setIsGoogleLoading(false);
        setError("The browser blocked the Google redirect. Please click 'Open in New Tab' at the top right of the preview window.");
      }, 3000);
      await signInWithRedirect(auth, googleProvider);
      
    } catch (err: any) {
      setIsGoogleLoading(false);
      console.error("Click Handler Error:", err);
      setError(\`Login Failed: \${err.code} - \${err.message}\`);
    }
  };`;

content = content.replace(clickHandlerRegex, newClickHandler);

fs.writeFileSync('src/pages/Login.tsx', content);
