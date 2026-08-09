/**
 * The printable hours transcript must be well-formed and must escape.
 *
 *   npm run check:certificate
 *
 * This document is written into a new browser window and printed, then handed
 * to a school as evidence toward the 40 community-involvement hours Ontario
 * requires to graduate. Two ways it can go wrong, neither visible in a
 * typecheck:
 *
 *   1. Malformed HTML — the student prints a broken or empty page.
 *   2. Unescaped values — a name or activity description containing markup
 *      becomes live HTML in a document about to be printed. The student
 *      controls both fields.
 *
 * It exists because the builder was extracted out of a 2,400-line component by
 * mechanical surgery on template literals, and "it compiles" proves neither.
 */
import assert from 'node:assert/strict';
import { buildCertificateHtml } from '../src/pages/studentDashboard/certificate';

const html = buildCertificateHtml(
  {
    fullName: 'Ada <script>alert(1)</script> Lovelace',
    school: 'Earl Haig Secondary School',
    grade: '11',
    loggedHours: [
      { id: '1', activity: 'Food bank & "sorting"', hours: 3.5, date: '2026-01-15', approved: true },
      { id: '2', activity: 'Park cleanup', hours: 2, date: '2026-02-01', approved: true },
    ],
  } as any,
  5.5,
);

assert.ok(typeof html === 'string' && html.length > 500, 'produced no usable document');
assert.ok(html.includes('<html') && html.includes('</html>'), 'not a complete HTML document');
assert.equal(
  (html.match(/<table/g) || []).length,
  (html.match(/<\/table>/g) || []).length,
  'unbalanced <table> tags — the printed page would be broken',
);
assert.ok(!html.includes('${'), 'an unresolved template literal reached the output');

// Escaping. The student controls fullName and every activity string.
assert.ok(!html.includes('<script>alert(1)</script>'), 'SCRIPT TAG SURVIVED ESCAPING');
assert.ok(html.includes('&lt;script&gt;'), 'the name was not HTML-escaped');
assert.ok(html.includes('&quot;sorting&quot;'), 'quotes in an activity were not escaped');

// Content actually made it in.
assert.ok(html.includes('Ada'), 'student name missing');
assert.ok(html.includes('Food bank') && html.includes('Park cleanup'), 'logged hours missing');
assert.ok(html.includes('5.5'), 'hour total missing');

// An empty profile must still print rather than throw — a student with no
// approved hours can legitimately open this.
const empty = buildCertificateHtml({ fullName: '', loggedHours: [] } as any, 0);
assert.ok(empty.includes('</html>'), 'an empty transcript failed to render');

console.log('[PASS] certificate: well-formed, escapes student-controlled text, renders when empty');
