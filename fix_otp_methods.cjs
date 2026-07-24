const fs = require('fs');
let content = fs.readFileSync('src/pages/Login.tsx', 'utf8');

const otpMethods = `
  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) return;
    const newOtp = [...otpDigits];
    newOtp[index] = value;
    setOtpDigits(newOtp);
    if (value && index < 5) {
      const nextInput = document.getElementById(\`otp-\${index + 1}\`);
      nextInput?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      const prevInput = document.getElementById(\`otp-\${index - 1}\`);
      prevInput?.focus();
    }
  };
`;

content = content.replace('  const handleVerifyMfa = async (e: React.FormEvent) => {', otpMethods + '\n  const handleVerifyMfa = async (e: React.FormEvent) => {');

fs.writeFileSync('src/pages/Login.tsx', content);
