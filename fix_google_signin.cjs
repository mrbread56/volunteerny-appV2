const fs = require('fs');

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace the catch block for handleGoogleLogin
  const searchRegex = /catch \(err: any\) \{[\s\S]*?\} finally \{/g;
  
  let matches = [...content.matchAll(searchRegex)];
  
  // We want to replace the one that has "Error signing in with Google"
  for (let match of matches) {
    if (match[0].includes('Error signing in with Google')) {
      const newCatch = `catch (err: any) {
      console.error("Google Auth Error:", err);
      if (err.code === "auth/operation-not-allowed") {
        setError(
          'FIREBASE SETUP REQUIRED: Open Firebase Console > Authentication > "Get Started" > "Sign-in method". Enable Google provider. Set a support email.'
        );
      } else if (err.code === "auth/unauthorized-domain") {
        setError(
          'DOMAIN BLOCKED: Add ' + window.location.hostname + ' to Firebase Console > Authentication > Settings > Authorized domains.'
        );
      } else if (err.code === "auth/popup-blocked") {
        setError(
          "Popup blocked. Please allow popups for this site."
        );
      } else if (err.code === "auth/internal-error" || err.message?.includes("internal-error")) {
        setError(
          "INTERNAL ERROR: If you are viewing this inside the AI Studio preview, Google Sign-In is blocked by iframe third-party cookie restrictions. PLEASE CLICK THE 'OPEN IN NEW TAB' ARROW ICON AT THE TOP RIGHT OF THIS WINDOW TO LOGIN."
        );
      } else {
        setError("Error: " + (err.message || "Could not sign in with Google. Try opening in a new tab."));
      }
    } finally {`;
      content = content.replace(match[0], newCatch);
    }
  }

  fs.writeFileSync(filePath, content);
}

fixFile('src/pages/Login.tsx');
fixFile('src/pages/Signup.tsx');
