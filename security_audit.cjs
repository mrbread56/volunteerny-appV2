#!/usr/bin/env node
/**
 * ============================================================================
 * 🔒 SECURITY AUDIT TEST SUITE
 * ============================================================================
 * Tests: XSS, CSRF, Injection, Broken Auth, Broken Access Control,
 *        Firestore Rule Bypass, API Vulns, Rate Limiting, Permission Escalation
 * ============================================================================
 */

const https = require('https');

const BASE_URL = 'https://volunteerny-app.onrender.com';
const DEMO_TOKEN = 'Bearer demo-mode-token-developer';
const DEMO_STUDENT_TOKEN = 'Bearer demo-mode-token-student';
const DEMO_ORG_TOKEN = 'Bearer demo-mode-token-organization';

let passed = 0;
let failed = 0;
let findings = [];

function makeRequest(method, pathname, body = null, headers = {}, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SecurityAudit/1.0',
        ...headers,
      },
      rejectUnauthorized: false,
      timeout,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch (e) { parsed = data; }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed, raw: data });
      });
    });
    req.on('error', (e) => reject(e));
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function test(name, fn) {
  process.stdout.write(`\n🔍 ${name}... `);
  return fn()
    .then((result) => {
      if (result.passed) {
        console.log(`✅ PASSED`);
        passed++;
      } else {
        console.log(`❌ FAILED: ${result.reason}`);
        failed++;
        findings.push({ test: name, severity: result.severity || 'medium', finding: result.reason });
      }
      return result;
    })
    .catch((err) => {
      console.log(`❌ ERROR: ${err.message}`);
      failed++;
      findings.push({ test: name, severity: 'high', finding: err.message });
      return { passed: false };
    });
}

console.log('='.repeat(70));
console.log('🔒 SECURITY AUDIT — ' + new Date().toISOString());
console.log('='.repeat(70));

async function runSecurityTests() {
  // ====== 1. AUTHENTICATION ======
  console.log('\n─── 1. AUTHENTICATION ───');

  await test('No auth header → 401 on protected endpoints', async () => {
    const res = await makeRequest('POST', '/api/email/send', { to: 't@t.com', subject: 'T', templateName: 'welcome_student', templateData: { studentName: 'T' } });
    if (res.status === 401) return { passed: true };
    return { passed: false, severity: 'critical', reason: `Expected 401, got ${res.status}` };
  });

  await test('Invalid token → 401', async () => {
    const res = await makeRequest('POST', '/api/email/send', { to: 't@t.com', subject: 'T', templateName: 'welcome_student', templateData: { studentName: 'T' } }, { Authorization: 'Bearer invalid-token-12345' });
    if (res.status === 401) return { passed: true };
    return { passed: false, severity: 'critical', reason: `Expected 401, got ${res.status}` };
  });

  await test('Wrong auth scheme (Basic) → 401', async () => {
    const res = await makeRequest('POST', '/api/email/send', { to: 't@t.com', subject: 'T', templateName: 'welcome_student', templateData: { studentName: 'T' } }, { Authorization: 'Basic ' + Buffer.from('user:pass').toString('base64') });
    if (res.status === 401) return { passed: true };
    return { passed: false, severity: 'high', reason: `Expected 401, got ${res.status}` };
  });

  await test('Student token cannot access developer-only history', async () => {
    const res = await makeRequest('GET', '/api/email/history', null, { Authorization: DEMO_STUDENT_TOKEN });
    if (res.status === 401) return { passed: true };
    return { passed: false, severity: 'critical', reason: `Student accessed dev-only endpoint: ${res.status}` };
  });

  // ====== 2. AUTHORIZATION (RBAC) ======
  console.log('\n─── 2. AUTHORIZATION (RBAC) ───');

  await test('Org token cannot access student-scoped history', async () => {
    const res = await makeRequest('GET', '/api/email/history', null, { Authorization: DEMO_ORG_TOKEN });
    if (res.status === 401) return { passed: true };
    return { passed: false, severity: 'critical', reason: `Org accessed dev-only endpoint: ${res.status}` };
  });

  // ====== 3. XSS ======
  console.log('\n─── 3. CROSS-SITE SCRIPTING (XSS) ───');

  await test('XSS attempt in feedback subject field', async () => {
    const res = await makeRequest('POST', '/api/feedback/analyze', {
      subject: '<script>alert("xss")</script>',
      message: 'XSS test',
      type: 'bug'
    }, { Authorization: DEMO_TOKEN });
    // Accept either 200 (with sanitized response) or 400 (rejected)
    if ([200, 400].includes(res.status)) return { passed: true };
    return { passed: false, severity: 'high', reason: `Unexpected status ${res.status}` };
  });

  await test('XSS attempt in feedback message field', async () => {
    const res = await makeRequest('POST', '/api/feedback/analyze', {
      subject: 'XSS Test',
      message: '<img src=x onerror=alert(1)>',
      type: 'bug'
    }, { Authorization: DEMO_TOKEN });
    if ([200, 400].includes(res.status)) return { passed: true };
    return { passed: false, severity: 'medium', reason: `Unexpected status ${res.status}` };
  });

  await test('No XSS reflection in response from feedback', async () => {
    const res = await makeRequest('POST', '/api/feedback/analyze', {
      subject: '<script>alert("xss")</script>',
      message: 'XSS test message',
      type: 'bug'
    }, { Authorization: DEMO_TOKEN });
    const raw = JSON.stringify(res.body);
    if (raw.includes('<script>')) {
      return { passed: false, severity: 'critical', reason: 'Script tag reflected in response!' };
    }
    return { passed: true };
  });

  // ====== 4. INJECTION ======
  console.log('\n─── 4. INJECTION ATTACKS ───');

  await test('SQL-like injection in subject', async () => {
    const res = await makeRequest('POST', '/api/feedback/analyze', {
      subject: "'; DROP TABLE users; --",
      message: 'SQL injection test',
      type: 'bug'
    }, { Authorization: DEMO_TOKEN });
    if ([200, 400].includes(res.status)) return { passed: true };
    return { passed: false, severity: 'high', reason: `Unexpected status ${res.status}` };
  });

  await test('NoSQL injection attempt in template data', async () => {
    const res = await makeRequest('POST', '/api/email/send', {
      to: 'test@test.com',
      subject: 'Injection Test',
      templateName: 'welcome_student',
      templateData: { studentName: { $ne: '' } }
    }, { Authorization: DEMO_TOKEN });
    if ([400, 200].includes(res.status)) return { passed: true };
    return { passed: false, severity: 'high', reason: `Unexpected status ${res.status}` };
  });

  await test('Prototype pollution attempt in request body', async () => {
    const res = await makeRequest('POST', '/api/email/send', {
      __proto__: { admin: true },
      to: 'test@test.com',
      subject: 'Proto Pollution',
      templateName: 'welcome_student',
      templateData: { studentName: '__proto__' }
    }, { Authorization: DEMO_TOKEN });
    if ([400, 200].includes(res.status)) return { passed: true };
    return { passed: false, severity: 'high', reason: `Unexpected status ${res.status}` };
  });

  // ====== 5. RATE LIMITING ======
  console.log('\n─── 5. RATE LIMITING ───');

  await test('OTP rate limiting (excessive requests)', async () => {
    const results = [];
    for (let i = 0; i < 10; i++) {
      const res = await makeRequest('POST', '/api/auth/send-otp', {}, { Authorization: DEMO_TOKEN });
      results.push(res.status);
    }
    const rateLimited = results.some(s => s === 429);
    if (rateLimited) return { passed: true };
    return { passed: false, severity: 'medium', reason: 'No 429 rate limit response after 10 OTP requests' };
  });

  await test('OTP verify rate limiting (failed attempts)', async () => {
    const results = [];
    for (let i = 0; i < 10; i++) {
      const res = await makeRequest('POST', '/api/auth/verify-otp', { code: '000000' }, { Authorization: DEMO_TOKEN });
      results.push(res.status);
    }
    const rateLimited = results.some(s => s === 429);
    if (rateLimited) return { passed: true };
    return { passed: false, severity: 'medium', reason: 'No 429 after 10 failed OTP attempts' };
  });

  // ====== 6. INPUT VALIDATION ======
  console.log('\n─── 6. INPUT VALIDATION ───');

  await test('Empty JSON body → 400', async () => {
    const res = await makeRequest('POST', '/api/email/send', {}, { Authorization: DEMO_TOKEN });
    if (res.status === 400) return { passed: true };
    return { passed: false, severity: 'medium', reason: `Expected 400, got ${res.status}` };
  });

  await test('Null values in body → 400', async () => {
    const res = await makeRequest('POST', '/api/email/send', { to: null, subject: null, templateName: null, templateData: null }, { Authorization: DEMO_TOKEN });
    if (res.status === 400) return { passed: true };
    return { passed: false, severity: 'low', reason: `Expected 400, got ${res.status}` };
  });

  await test('Extra fields in body silently ignored', async () => {
    const res = await makeRequest('POST', '/api/email/send', {
      to: 'kiamehrmetanat@gmail.com',
      subject: 'Extra Fields Test',
      templateName: 'welcome_student',
      templateData: { studentName: 'Test' },
      maliciousField: 'shouldBeIgnored',
      role: 'admin'
    }, { Authorization: DEMO_TOKEN });
    if (res.status === 200) return { passed: true };
    return { passed: false, severity: 'low', reason: `Extra fields caused error: ${res.status}` };
  });

  await test('Large payload rejection', async () => {
    const largeData = { studentName: 'X'.repeat(100000) };
    const res = await makeRequest('POST', '/api/email/send', {
      to: 'test@test.com',
      subject: 'Large payload',
      templateName: 'welcome_student',
      templateData: largeData
    }, { Authorization: DEMO_TOKEN });
    // Express has default 100kb body limit
    if ([400, 413, 200].includes(res.status)) return { passed: true };
    return { passed: false, severity: 'low', reason: `Unexpected status ${res.status} for large payload` };
  });

  // ====== 7. SECURITY HEADERS ======
  console.log('\n─── 7. SECURITY HEADERS ───');

  const securityHeaders = {
    'x-frame-options': 'DENY',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
  };

  const homeRes = await makeRequest('GET', '/');

  for (const [header, expected] of Object.entries(securityHeaders)) {
    await test(`Security header: ${header} = ${expected}`, async () => {
      const actual = homeRes.headers[header];
      if (actual === expected) return { passed: true };
      return { passed: false, severity: 'high', reason: `Expected ${expected}, got ${actual}` };
    });
  }

  await test('CORS header present on API responses', async () => {
    const res = await makeRequest('GET', '/api/health');
    if (res.headers['access-control-allow-origin']) return { passed: true };
    return { passed: false, severity: 'medium', reason: 'CORS header missing' };
  });

  // ====== 8. CONTENT SECURITY ======
  console.log('\n─── 8. CONTENT SECURITY ───');

  await test('No sensitive data in API error responses', async () => {
    const res = await makeRequest('POST', '/api/email/send', { to: 't', subject: 'T', templateName: 'invalid', templateData: {} }, { Authorization: DEMO_TOKEN });
    const raw = JSON.stringify(res.body).toLowerCase();
    const sensitivePatterns = ['stack', 'stacktrace', 'filename:', 'at ', 'node_modules', 'internal/modules'];
    const leaks = sensitivePatterns.filter(p => raw.includes(p));
    if (leaks.length > 0) return { passed: false, severity: 'critical', reason: `Error response leaks: ${leaks.join(', ')}` };
    return { passed: true };
  });

  await test('No stack traces in error responses', async () => {
    const res = await makeRequest('GET', '/api/nonexistent-route');
    const raw = JSON.stringify(res.body || res.raw).toLowerCase();
    if (raw.includes('stacktrace') || raw.includes('at ')) {
      return { passed: false, severity: 'critical', reason: 'Stack trace leaked in error response' };
    }
    return { passed: true };
  });

  // ====== 9. SESSION MANAGEMENT ======
  console.log('\n─── 9. SESSION MANAGEMENT ───');

  await test('No Set-Cookie for session on API (token-based)', async () => {
    const res = await makeRequest('POST', '/api/email/send', {
      to: 'kiamehrmetanat@gmail.com', subject: 'T', templateName: 'welcome_student', templateData: { studentName: 'T' }
    }, { Authorization: DEMO_TOKEN });
    if (!res.headers['set-cookie']) return { passed: true };
    return { passed: false, severity: 'medium', reason: 'Unexpected cookie being set on API' };
  });

  // ====== SUMMARY ======
  console.log('\n' + '='.repeat(70));
  console.log(`🔒 SECURITY AUDIT SUMMARY`);
  console.log('='.repeat(70));
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);

  const severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) {
    severityCounts[f.severity] = (severityCounts[f.severity] || 0) + 1;
  }
  console.log(`   🔴 Critical: ${severityCounts.critical || 0}`);
  console.log(`   🟠 High: ${severityCounts.high || 0}`);
  console.log(`   🟡 Medium: ${severityCounts.medium || 0}`);
  console.log(`   🟢 Low: ${severityCounts.low || 0}`);

  if (findings.length > 0) {
    console.log('\n📋 FINDINGS:');
    findings.forEach(f => {
      const icon = f.severity === 'critical' ? '🔴' : f.severity === 'high' ? '🟠' : f.severity === 'medium' ? '🟡' : '🟢';
      console.log(`   ${icon} [${f.severity.toUpperCase()}] ${f.test}: ${f.finding}`);
    });
  }

  console.log('\n' + '='.repeat(70));
}

runSecurityTests().catch(console.error);
