const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

const securityHeadersBlockRegex = /\/\/ 2\. Security Headers[\s\S]*?next\(\);/g;

const originalSecurityHeaders = `// 2. Security Headers (Defenses against XSS, Click-jacking, MIME sniffing, and Cookie theft)
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.google.com https://www.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https: wss:; frame-src 'self' https://www.google.com https://volunteer-ny.firebaseapp.com; object-src 'none'; upgrade-insecure-requests;");
    next();`;

if (content.match(securityHeadersBlockRegex)) {
  content = content.replace(securityHeadersBlockRegex, originalSecurityHeaders);
  fs.writeFileSync('server.ts', content);
  console.log("Restored original security headers successfully.");
} else {
  console.log("Failed to find security headers block.");
}
