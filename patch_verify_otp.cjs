const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

const replacement = `    // Correct verification: remove OTP from storage, update claims if auth, and return success
    otpStorage.delete(email.toLowerCase().trim());

    try {
      const adminInstance = getFirebaseAdmin();
      if (!adminInstance) {
        return res.status(500).json({ error: "Firebase Admin not initialized."});
      }

      const authUser = await verifyAuth(req);
      if (authUser && !authUser.isDemo) {
          const userRecord = await adminInstance.auth().getUser(authUser.uid);
          const currentClaims = userRecord.customClaims || {};
          await adminInstance.auth().setCustomUserClaims(authUser.uid, {
            ...currentClaims,
            mfa_verified: true
          });
          console.log(\`[MFA Custom Claim Set] Successfully set mfa_verified custom claim for user: \${authUser.uid}\`);
          return res.json({ success: true });
      } else {
         // Create custom token for passwordless login
         let uid;
         let isNewUser = false;
         try {
           const userRecord = await adminInstance.auth().getUserByEmail(email);
           uid = userRecord.uid;
         } catch(e) {
           if (e.code === 'auth/user-not-found') {
              const newUser = await adminInstance.auth().createUser({ email, emailVerified: true });
              uid = newUser.uid;
              isNewUser = true;
           } else {
              throw e;
           }
         }
         const token = await adminInstance.auth().createCustomToken(uid, { mfa_verified: true });
         return res.json({ success: true, customToken: token, isNewUser });
      }
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "Failed to complete authentication: " + (e.message || e) });
    }`;

// Replace the end of verify-otp
content = content.replace(/    \/\/ Correct verification: remove OTP from storage, update claims if auth, and return success[\s\S]*?    return res\.json\({ success: true }\);/m, replacement);

fs.writeFileSync('server.ts', content);
