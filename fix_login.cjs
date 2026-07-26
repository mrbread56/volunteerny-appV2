const fs = require('fs');
let content = fs.readFileSync('src/pages/Login.tsx', 'utf8');

// Fix setMfaStep
content = content.replace(/setMfaStep\(true\);/g, 'setStep("mfa");');

// We also need to fix handleOtpChange and handleOtpKeyDown which I might have accidentally broken?
// Wait, the variables were otpDigits, setOtpDigits, but my patch for handleVerifyMfa used `mfaDigits.join("")`.
// Let's replace mfaDigits with otpDigits
content = content.replace(/const codeString = mfaDigits\.join\(""\);/g, 'const codeString = otpDigits.join("");');

// We need to delete the forgot password section entirely.
// Let's just remove the case for "forgot" or any UI that renders forgot password.
// The file has something like: `{step === "forgot" ? ( ... ) : step === "mfa" ? ...`
content = content.replace(/\{step === "forgot" \? \([\s\S]*?\) : step === "mfa" \?/g, '{step === "mfa" ?');

fs.writeFileSync('src/pages/Login.tsx', content);
