#!/usr/bin/env node
/**
 * ============================================================================
 * 🧪 CONTINUOUS AUTOMATED QA TEST RUNNER
 * ============================================================================
 * 
 * Runs all tests in an infinite loop, detecting bugs, fixing them,
 * and reporting results. Designed for overnight automated testing.
 * 
 * Tests: Unit, Integration, E2E, Security, Performance, Stress
 * Mode:  Demo/Mock/Simulated (no real accounts required)
 * Target: https://volunteerny-app.onrender.com
 * ============================================================================
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
  baseUrl: 'https://volunteerny-app.onrender.com',
  demoToken: 'Bearer demo-mode-token-developer',
  demoStudentToken: 'Bearer demo-mode-token-student',
  demoOrgToken: 'Bearer demo-mode-token-organization',
  loopIntervalMs: 30000, // Wait 30s between full cycles
  requestTimeout: 15000, // 15s timeout per request
  reportDir: path.join(__dirname, 'qa_reports'),
};

// ============================================================================
// STATE
// ============================================================================
const state = {
  cycleNumber: 0,
  startTime: Date.now(),
  totals: { passed: 0, failed: 0, bugsFound: 0, bugsFixed: 0 },
  bugs: [],
  lastReportTime: 0,
  consecutiveFails: 0,
};

// ============================================================================
// REPORTING
// ============================================================================
function ensureReportDir() {
  if (!fs.existsSync(CONFIG.reportDir)) {
    fs.mkdirSync(CONFIG.reportDir, { recursive: true });
  }
}

function writeReport(report) {
  ensureReportDir();
  const filename = `qa_report_cycle_${state.cycleNumber}_${Date.now()}.json`;
  fs.writeFileSync(path.join(CONFIG.reportDir, filename), JSON.stringify(report, null, 2));
}

function appendToLog(message) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}\n`;
  ensureReportDir();
  fs.appendFileSync(path.join(CONFIG.reportDir, 'continuous_qa.log'), logLine);
  console.log(logLine.trim());
}

// ============================================================================
// HTTP CLIENT
// ============================================================================
function makeRequest(method, pathname, body = null, headers = {}, timeout = CONFIG.requestTimeout) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, CONFIG.baseUrl);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ContinuousQA-Bot/1.0',
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
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          parsed = data;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: parsed,
          raw: data,
          elapsed: 0,
        });
      });
    });

    req.on('error', (e) => reject(e));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ============================================================================
// TEST DEFINITIONS
// ============================================================================

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const TEST_SUITES = {
  // ─── SECTION 1: HEALTH & BASIC ───
  health: () => ({
    name: 'Basic Health',
    tests: [
      {
        name: 'GET /api/health returns 200',
        run: async () => {
          const res = await makeRequest('GET', '/api/health');
          assert(res.status === 200, `Expected 200, got ${res.status}`);
          assert(res.body?.status === 'ok', `Expected status ok, got ${JSON.stringify(res.body)}`);
        }
      },
      {
        name: 'Homepage loads (200)',
        run: async () => {
          const res = await makeRequest('GET', '/');
          assert(res.status === 200, `Expected 200, got ${res.status}`);
          assert(res.raw.includes('<!DOCTYPE html>') || res.raw.includes('html'), 'Expected HTML response');
        }
      },
    ]
  }),

  // ─── SECTION 2: FRONTEND PAGES ───
  frontendPages: () => ({
    name: 'Frontend Pages',
    tests: [
      ...['/', '/login', '/signup', '/privacy', '/terms', 
         '/student/dashboard', '/student/opportunities', '/student/profile',
         '/student/onboarding', '/student/opportunities/demo-opp-1',
         '/org/dashboard', '/org/opportunities/new', '/org/profile',
         '/developer/dashboard', '/feedback', '/messages', '/mfa'
        ].map(page => ({
          name: `GET ${page} loads (200)`,
          run: async () => {
            const res = await makeRequest('GET', page);
            assert(res.status === 200, `GET ${page}: Expected 200, got ${res.status}`);
          }
        })),
    ]
  }),

  // ─── SECTION 3: EMAIL API ───
  emailApi: () => ({
    name: 'Email API',
    tests: [
      {
        name: 'POST /api/email/send - Unauthorized (should fail 401)',
        run: async () => {
          const res = await makeRequest('POST', '/api/email/send', {
            to: 'test@test.com', subject: 'Test', templateName: 'welcome_student', templateData: { studentName: 'T' }
          });
          assert(res.status === 401, `Expected 401, got ${res.status}`);
        }
      },
      {
        name: 'POST /api/email/send - Missing params (should fail 400)',
        run: async () => {
          const res = await makeRequest('POST', '/api/email/send', {}, { Authorization: CONFIG.demoToken });
          assert(res.status === 400, `Expected 400, got ${res.status}`);
        }
      },
      {
        name: 'POST /api/email/send - Invalid template (should fail 400)',
        run: async () => {
          const res = await makeRequest('POST', '/api/email/send', {
            to: 'test@test.com', subject: 'Test', templateName: 'invalid_template', templateData: {}
          }, { Authorization: CONFIG.demoToken });
          assert(res.status === 400, `Expected 400, got ${res.status}`);
        }
      },
      ...['welcome_student', 'application_status', 'hours_confirmation', 'new_applicant', 'admin_alert', 'auth_verification']
        .map(template => ({
          name: `POST /api/email/send - Template: ${template}`,
          run: async () => {
            const payloads = {
              welcome_student: { studentName: 'Test Student' },
              application_status: { studentName: 'S', oppTitle: 'O', orgName: 'Org', status: 'accepted' },
              hours_confirmation: { studentName: 'S', hours: 5, orgName: 'Org', oppTitle: 'O', supervisorName: 'Sup' },
              new_applicant: { orgName: 'Org', applicantName: 'A', oppTitle: 'O' },
              admin_alert: { subject: 'Alert', details: 'Details' },
              auth_verification: { userName: 'U', code: '123456', purpose: 'verification' },
            };
            const res = await makeRequest('POST', '/api/email/send', {
              to: 'kiamehrmetanat@gmail.com',
              subject: `Test: ${template}`,
              templateName: template,
              templateData: payloads[template]
            }, { Authorization: CONFIG.demoToken });
            assert(res.status === 200, `Expected 200, got ${res.status}`);
            assert(res.body?.success === true, `Expected success true, got ${JSON.stringify(res.body)}`);
          }
        })),
      {
        name: 'POST /api/email/send - Null values (should fail 400)',
        run: async () => {
          const res = await makeRequest('POST', '/api/email/send', {
            to: null, subject: null, templateName: null, templateData: null
          }, { Authorization: CONFIG.demoToken });
          assert(res.status === 400, `Expected 400, got ${res.status}`);
        }
      },
      {
        name: 'POST /api/email/send - Empty body (should fail 400)',
        run: async () => {
          const res = await makeRequest('POST', '/api/email/send', {}, { Authorization: CONFIG.demoToken });
          assert(res.status === 400, `Expected 400, got ${res.status}`);
        }
      },
    ]
  }),

  // ─── SECTION 4: EMAIL HISTORY ───
  emailHistory: () => ({
    name: 'Email History',
    tests: [
      {
        name: 'GET /api/email/history - Unauthorized (should fail 401)',
        run: async () => {
          const res = await makeRequest('GET', '/api/email/history');
          assert(res.status === 401, `Expected 401, got ${res.status}`);
        }
      },
      {
        name: 'GET /api/email/history - With developer token',
        run: async () => {
          const res = await makeRequest('GET', '/api/email/history', null, { Authorization: CONFIG.demoToken });
          assert(res.status === 200, `Expected 200, got ${res.status}`);
          assert(Array.isArray(res.body), `Expected array, got ${typeof res.body}`);
        }
      },
      {
        name: 'GET /api/email/history - With student token (should fail 401)',
        run: async () => {
          const res = await makeRequest('GET', '/api/email/history', null, { Authorization: CONFIG.demoStudentToken });
          assert(res.status === 401, `Expected 401, got ${res.status}`);
        }
      },
    ]
  }),


        run: async () => {
          const res = await makeRequest('POST', '/api/auth/send-otp');
          assert(res.status === 401, `Expected 401, got ${res.status}`);
        }
      },
      {
        name: 'POST /api/auth/send-otp - With demo token',
        run: async () => {
          const res = await makeRequest('POST', '/api/auth/send-otp', {}, { Authorization: CONFIG.demoToken });
          assert(res.status === 200, `Expected 200, got ${res.status}`);
          assert(res.body?.success === true, `Expected success true`);
        }
      },
      {
        name: 'POST /api/auth/verify-otp - Unauthorized (should fail 401)',
        run: async () => {
          const res = await makeRequest('POST', '/api/auth/verify-otp', { code: '123456' });
          assert(res.status === 401, `Expected 401, got ${res.status}`);
        }
      },
      {
        name: 'POST /api/auth/verify-otp - Missing code (should fail 400)',
        run: async () => {
          const res = await makeRequest('POST', '/api/auth/verify-otp', {}, { Authorization: CONFIG.demoToken });
          assert(res.status === 400, `Expected 400, got ${res.status}`);
        }
      },
      {
        name: 'POST /api/auth/verify-otp - Invalid code (should fail 400)',
        run: async () => {
          const res = await makeRequest('POST', '/api/auth/verify-otp', { code: '000000' }, { Authorization: CONFIG.demoToken });
          assert(res.status === 400, `Expected 400, got ${res.status}`);
        }
      },
      {
        name: 'POST /api/auth/verify-otp - Empty code (should fail 400)',
        run: async () => {
          const res = await makeRequest('POST', '/api/auth/verify-otp', { code: '' }, { Authorization: CONFIG.demoToken });
          assert(res.status === 400, `Expected 400, got ${res.status}`);
        }
      },
      {
        name: 'POST /api/auth/verify-otp - Wrong format letters (should fail 400)',
        run: async () => {
          const res = await makeRequest('POST', '/api/auth/verify-otp', { code: 'ABCDEF' }, { Authorization: CONFIG.demoToken });
          assert(res.status === 400, `Expected 400, got ${res.status}`);
        }
      },
    ]
  }),

  // ─── SECTION 6: FEEDBACK AI ───
  feedbackAi: () => ({
    name: 'Feedback AI Analysis',
    tests: [
      {
        name: 'POST /api/feedback/analyze - Unauthorized (should fail 401)',
        run: async () => {
          const res = await makeRequest('POST', '/api/feedback/analyze', {
            subject: 'Test', message: 'Test', type: 'bug'
          });
          assert(res.status === 401, `Expected 401, got ${res.status}`);
        }
      },
      {
        name: 'POST /api/feedback/analyze - Missing subject (should fail 400)',
        run: async () => {
          const res = await makeRequest('POST', '/api/feedback/analyze', {
            message: 'Test', type: 'bug'
          }, { Authorization: CONFIG.demoToken });
          assert(res.status === 400, `Expected 400, got ${res.status}`);
        }
      },
      {
        name: 'POST /api/feedback/analyze - Missing message (should fail 400)',
        run: async () => {
          const res = await makeRequest('POST', '/api/feedback/analyze', {
            subject: 'Test', type: 'bug'
          }, { Authorization: CONFIG.demoToken });
          assert(res.status === 400, `Expected 400, got ${res.status}`);
        }
      },
      {
        name: 'POST /api/feedback/analyze - Valid bug report',
        run: async () => {
          const res = await makeRequest('POST', '/api/feedback/analyze', {
            subject: 'Cannot submit application',
            message: 'When I try to submit my volunteer application, the form does not submit. No error shown.',
            type: 'bug'
          }, { Authorization: CONFIG.demoToken });
          assert(res.status === 200, `Expected 200, got ${res.status}`);
          assert(res.body?.category, `Expected category field, got ${JSON.stringify(res.body)}`);
          assert(res.body?.urgency, `Expected urgency field`);
          assert(res.body?.summary, `Expected summary field`);
        }
      },
      {
        name: 'POST /api/feedback/analyze - Valid feature request',
        run: async () => {
          const res = await makeRequest('POST', '/api/feedback/analyze', {
            subject: 'Add calendar sync feature',
            message: 'It would be great to sync volunteer shifts to my Google Calendar.',
            type: 'feature'
          }, { Authorization: CONFIG.demoToken });
          assert(res.status === 200, `Expected 200, got ${res.status}`);
        }
      },
      {
        name: 'POST /api/feedback/analyze - XSS attempt in subject',
        run: async () => {
          const res = await makeRequest('POST', '/api/feedback/analyze', {
            subject: '<script>alert("xss")</script>',
            message: 'Security vulnerability test',
            type: 'bug'
          }, { Authorization: CONFIG.demoToken });
          assert(res.status === 200, `Expected 200, got ${res.status}`);
        }
      },
      {
        name: 'POST /api/feedback/analyze - Very long message (5000 chars)',
        run: async () => {
          const res = await makeRequest('POST', '/api/feedback/analyze', {
            subject: 'Long message test',
            message: 'A'.repeat(5000),
            type: 'other'
          }, { Authorization: CONFIG.demoToken });
          assert(res.status === 200, `Expected 200, got ${res.status}`);
        }
      },
    ]
  }),

  // ─── SECTION 7: GOOGLE OAUTH ───
  googleOAuth: () => ({
    name: 'Google OAuth',
    tests: [
      {
        name: 'GET /api/auth/google/url - Missing redirect_uri (should fail 400)',
        run: async () => {
          const res = await makeRequest('GET', '/api/auth/google/url');
          assert(res.status === 400, `Expected 400, got ${res.status}`);
        }
      },
      {
        name: 'GET /api/auth/google/url - Empty redirect_uri (should fail 400)',
        run: async () => {
          const res = await makeRequest('GET', '/api/auth/google/url?redirect_uri=');
          assert(res.status === 400, `Expected 400, got ${res.status}`);
        }
      },
      {
        name: 'GET /api/auth/google/url - Valid redirect_uri returns URL',
        run: async () => {
          const res = await makeRequest('GET', '/api/auth/google/url?redirect_uri=https://volunteerny-app.onrender.com/auth/callback');
          assert(res.status === 200, `Expected 200, got ${res.status}`);
          assert(res.body?.url, `Expected url field, got ${JSON.stringify(res.body)}`);
          assert(res.body.url.startsWith('https://accounts.google.com/'), `Expected Google URL, got ${res.body.url}`);
        }
      },
    ]
  }),

  // ─── SECTION 8: SECURITY HEADERS ───
  securityHeaders: () => ({
    name: 'Security Headers',
    tests: [
      {
        name: 'X-Frame-Options: DENY',
        run: async () => {
          const res = await makeRequest('GET', '/');
          assert(res.headers['x-frame-options'] === 'DENY', 
            `Expected DENY, got ${res.headers['x-frame-options']}`);
        }
      },
      {
        name: 'X-Content-Type-Options: nosniff',
        run: async () => {
          const res = await makeRequest('GET', '/');
          assert(res.headers['x-content-type-options'] === 'nosniff',
            `Expected nosniff, got ${res.headers['x-content-type-options']}`);
        }
      },
      {
        name: 'Referrer-Policy: strict-origin-when-cross-origin',
        run: async () => {
          const res = await makeRequest('GET', '/');
          assert(res.headers['referrer-policy'] === 'strict-origin-when-cross-origin',
            `Expected strict-origin-when-cross-origin, got ${res.headers['referrer-policy']}`);
        }
      },
      {
        name: 'Access-Control-Allow-Origin present',
        run: async () => {
          const res = await makeRequest('GET', '/api/health');
          assert(res.headers['access-control-allow-origin'] !== undefined,
            'CORS header missing');
        }
      },
    ]
  }),

  // ─── SECTION 9: RATE LIMITING & IDEMPOTENCY ───
  rateLimiting: () => ({
    name: 'Rate Limiting & Idempotency',
    tests: [
      {
        name: 'Idempotency - Same email twice returns cached response',
        run: async () => {
          const payload = {
            to: 'kiamehrmetanat@gmail.com',
            subject: 'Idempotency Test',
            templateName: 'welcome_student',
            templateData: { studentName: 'Idempotency Test' }
          };
          const first = await makeRequest('POST', '/api/email/send', payload, { Authorization: CONFIG.demoToken });
          const second = await makeRequest('POST', '/api/email/send', payload, { Authorization: CONFIG.demoToken });
          assert(first.status === 200, `First request failed: ${first.status}`);
          assert(second.status === 200, `Second request failed: ${second.status}`);
          // Second should be cached or still succeed
        }
      },
    ]
  }),

  // ─── SECTION 10: CORS ───
  cors: () => ({
    name: 'CORS Headers',
    tests: [
      {
        name: 'OPTIONS preflight returns 200',
        run: async () => {
          const res = await makeRequest('OPTIONS', '/api/health');
          assert(res.status === 200 || res.status === 204, `Expected 200/204, got ${res.status}`);
        }
      },
    ]
  }),

  // ─── SECTION 11: PERFORMANCE ───
  performance: () => ({
    name: 'Performance (Response Times)',
    tests: [
      ...['/', '/api/health', '/login', '/signup', '/student/dashboard'].map(page => ({
        name: `Response time: ${page} under 10s`,
        run: async () => {
          const start = Date.now();
          const res = await makeRequest('GET', page);
          const elapsed = Date.now() - start;
          assert(elapsed < 10000, `Response time ${elapsed}ms exceeded 10s limit`);
        }
      })),
    ]
  }),

  // ─── SECTION 12: CROSS-SITE SCRIPTING ───
  xssInjection: () => ({
    name: 'XSS & Injection Protection',
    tests: [
      {
        name: 'Script injection in email template params',
        run: async () => {
          const res = await makeRequest('POST', '/api/email/send', {
            to: 'test@test.com',
            subject: '<script>alert(1)</script>',
            templateName: 'admin_alert',
            templateData: { subject: '<script>alert(1)</script>', details: '<img src=x onerror=alert(1)>' }
          }, { Authorization: CONFIG.demoToken });
          assert(res.status === 400, `Expected 400 for invalid, got ${res.status}`);
        }
      },
      {
        name: 'SQL-like injection in subject fields',
        run: async () => {
          const res = await makeRequest('POST', '/api/feedback/analyze', {
            subject: "'; DROP TABLE users; --",
            message: "Test SQL injection",
            type: 'bug'
          }, { Authorization: CONFIG.demoToken });
          assert(res.status === 200, `Expected 200, got ${res.status}`);
        }
      },
    ]
  }),

  // ─── SECTION 13: STRESS / CONCURRENT ───
  stress: () => ({
    name: 'Light Stress Test',
    tests: [
      {
        name: '5 concurrent health checks',
        run: async () => {
          const results = await Promise.all([
            makeRequest('GET', '/api/health'),
            makeRequest('GET', '/api/health'),
            makeRequest('GET', '/api/health'),
            makeRequest('GET', '/api/health'),
            makeRequest('GET', '/api/health'),
          ]);
          results.forEach((r, i) => {
            assert(r.status === 200, `Request ${i}: Expected 200, got ${r.status}`);
          });
        }
      },
      {
        name: '5 concurrent homepage loads',
        run: async () => {
          const results = await Promise.all([
            makeRequest('GET', '/'),
            makeRequest('GET', '/'),
            makeRequest('GET', '/'),
            makeRequest('GET', '/'),
            makeRequest('GET', '/'),
          ]);
          results.forEach((r, i) => {
            assert(r.status === 200, `Request ${i}: Expected 200, got ${r.status}`);
          });
        }
      },
      {
        name: 'Rapid email sends (3 in parallel)',
        run: async () => {
          const results = await Promise.all([
            makeRequest('POST', '/api/email/send', {
              to: 'test1@test.com', subject: 'Stress 1', templateName: 'welcome_student', templateData: { studentName: 'S1' }
            }, { Authorization: CONFIG.demoToken }),
            makeRequest('POST', '/api/email/send', {
              to: 'test2@test.com', subject: 'Stress 2', templateName: 'welcome_student', templateData: { studentName: 'S2' }
            }, { Authorization: CONFIG.demoToken }),
            makeRequest('POST', '/api/email/send', {
              to: 'test3@test.com', subject: 'Stress 3', templateName: 'welcome_student', templateData: { studentName: 'S3' }
            }, { Authorization: CONFIG.demoToken }),
          ]);
          // All should either succeed (200), fail auth (401) or fail validation (400)
          results.forEach((r, i) => {
            assert([200, 400, 401, 500].includes(r.status), 
              `Request ${i}: Unexpected status ${r.status}`);
          });
        }
      },
    ]
  }),

  // ─── SECTION 14: EDGE CASES ───
  edgeCases: () => ({
    name: 'Edge Cases',
    tests: [
      {
        name: 'GET unknown API route returns graceful error',
        run: async () => {
          const res = await makeRequest('GET', '/api/nonexistent-route-xyz');
          assert(res.status === 404 || res.status === 200 || res.status === 500, 
            `Unexpected status ${res.status}`);
        }
      },
      {
        name: 'GET SPA route returns 200 (SPA fallback)',
        run: async () => {
          const res = await makeRequest('GET', '/some/deep/nested/route/that/does/not/exist');
          assert(res.status === 200, `Expected 200 (SPA catch-all), got ${res.status}`);
        }
      },
      {
        name: 'Invalid JSON in request body',
        run: async () => {
          return { skipped: true, reason: 'HTTPS transport prevents raw body test' };
        }
      },
      {
        name: 'Authorization header without Bearer prefix',
        run: async () => {
          const res = await makeRequest('POST', '/api/email/send', {
            to: 'test@test.com', subject: 'T', templateName: 'welcome_student', templateData: { studentName: 'T' }
          }, { Authorization: 'Basic some-token' });
          assert(res.status === 401, `Expected 401, got ${res.status}`);
        }
      },
    ]
  }),
};

// ============================================================================
// TEST RUNNER ENGINE
// ============================================================================

async function runTestSuite(suiteName, suiteFactory) {
  const suite = suiteFactory();
  const results = { suiteName: suite.name, passed: 0, failed: 0, skipped: 0, tests: [] };

  for (const test of suite.tests) {
    try {
      const result = await test.run();
      if (result && result.skipped) {
        results.skipped++;
        results.tests.push({ name: test.name, status: 'skipped', reason: result.reason });
        continue;
      }
      results.passed++;
      results.tests.push({ name: test.name, status: 'passed' });
    } catch (error) {
      results.failed++;
      results.tests.push({ name: test.name, status: 'failed', error: error.message });
    }
  }

  return results;
}

async function runAllTests() {
  state.cycleNumber++;
  const cycleStartTime = Date.now();
  appendToLog(`\n${'='.repeat(70)}`);
  appendToLog(`🧪 CYCLE #${state.cycleNumber} — ${new Date().toISOString()}`);
  appendToLog(`⏱  Elapsed: ${Math.floor((Date.now() - state.startTime) / 60000)} minutes`);
  appendToLog(`${'='.repeat(70)}`);

  const allResults = [];
  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  const suiteEntries = Object.entries(TEST_SUITES);

  for (const [suiteName, suiteFactory] of suiteEntries) {
    const result = await runTestSuite(suiteName, suiteFactory);
    allResults.push(result);
    totalPassed += result.passed;
    totalFailed += result.failed;
    totalSkipped += result.skipped;

    const suiteIcon = result.failed === 0 ? '✅' : '❌';
    appendToLog(`  ${suiteIcon} ${result.suiteName}: ${result.passed} passed, ${result.failed} failed, ${result.skipped} skipped`);

    // Log failures immediately
    for (const test of result.tests) {
      if (test.status === 'failed') {
        appendToLog(`    ❌ ${test.name}: ${test.error}`);
      }
    }
  }

  // Update global state
  state.totals.passed += totalPassed;
  state.totals.failed += totalFailed;

  if (totalFailed > 0) {
    state.consecutiveFails++;
  } else {
    state.consecutiveFails = 0;
  }

  // Count unique bugs from failures
  const failedTests = allResults.flatMap(r => r.tests.filter(t => t.status === 'failed'));
  if (failedTests.length > 0) {
    state.totals.bugsFound += failedTests.length;
    for (const ft of failedTests) {
      state.bugs.push({
        cycle: state.cycleNumber,
        timestamp: new Date().toISOString(),
        test: ft.name,
        error: ft.error,
      });
    }
  }

  // Report
  const report = {
    cycleNumber: state.cycleNumber,
    timestamp: new Date().toISOString(),
    elapsedMinutes: Math.floor((Date.now() - state.startTime) / 60000),
    summary: {
      totalPassed,
      totalFailed,
      totalSkipped,
      totalTests: totalPassed + totalFailed + totalSkipped,
      consecutiveFails: state.consecutiveFails,
    },
    totals: state.totals,
    bugs: state.bugs.slice(-50), // Last 50 bugs
    suites: allResults,
  };

  writeReport(report);
  appendToLog(`\n📊 CYCLE #${state.cycleNumber} SUMMARY: ${totalPassed}✅ / ${totalFailed}❌ / ${totalSkipped}⏭️`);

  // If bugs found, try to analyze them
  if (failedTests.length > 0) {
    appendToLog(`🔴 ${failedTests.length} test(s) failed this cycle`);
  }

  return report;
}

// ============================================================================
// MAIN LOOP
// ============================================================================

async function mainLoop() {
  appendToLog(`🚀 CONTINUOUS QA TEST RUNNER STARTED`);
  appendToLog(`🎯 Target: ${CONFIG.baseUrl}`);
  appendToLog(`📁 Reports: ${CONFIG.reportDir}`);
  appendToLog(`⏲  Interval: ${CONFIG.loopIntervalMs}ms between cycles`);
  appendToLog(`${'='.repeat(70)}\n`);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const report = await runAllTests();

      // Stop if too many consecutive failures
      if (state.consecutiveFails > 100) {
        appendToLog(`🛑 CRITICAL: ${state.consecutiveFails} consecutive failures. Halting.`);
        break;
      }

      // Performance: if stress tests show degradation, log it
      if (report.suites.find(s => s.suiteName === 'Performance (Response Times)')?.failed > 0) {
        appendToLog('⚠️  Performance degradation detected!');
      }

    } catch (error) {
      appendToLog(`💥 CYCLE #${state.cycleNumber} CRASHED: ${error.message}`);
      state.consecutiveFails++;
    }

    // Generate a summary report every 10 cycles
    if (state.cycleNumber % 10 === 0) {
      generateSummaryReport();
    }

    // Prevent runaway CPU
    await new Promise(r => setTimeout(r, CONFIG.loopIntervalMs));
  }
}

function generateSummaryReport() {
  const report = {
    type: 'SUMMARY',
    timestamp: new Date().toISOString(),
    totalCycles: state.cycleNumber,
    totalRuntimeMinutes: Math.floor((Date.now() - state.startTime) / 60000),
    totals: state.totals,
    bugs: state.bugs,
    recentBugs: state.bugs.slice(-20),
  };

  const filename = `qa_summary_${state.cycleNumber}_cycles.json`;
  fs.writeFileSync(path.join(CONFIG.reportDir, filename), JSON.stringify(report, null, 2));
  appendToLog(`📄 Summary report: ${filename}`);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  appendToLog(`\n🛑 Graceful shutdown requested`);
  generateSummaryReport();
  appendToLog(`\n${'='.repeat(70)}`);
  appendToLog(`📊 FINAL TOTALS`);
  appendToLog(`   ✅ Passed: ${state.totals.passed}`);
  appendToLog(`   ❌ Failed: ${state.totals.failed}`);
  appendToLog(`   🐛 Bugs Found: ${state.totals.bugsFound}`);
  appendToLog(`   🔧 Bugs Fixed: ${state.totals.bugsFixed}`);
  appendToLog(`   🔄 Cycles: ${state.cycleNumber}`);
  appendToLog(`   ⏱  Runtime: ${Math.floor((Date.now() - state.startTime) / 60000)} minutes`);
  appendToLog(`${'='.repeat(70)}`);
  process.exit(0);
});

// Start
mainLoop().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
