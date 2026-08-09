/**
 * The shared error mapping must never hand a user a raw internal string.
 *
 *   npm run check:errors
 *
 * This codebase's single most common bug has been the silent or leaky failure:
 * a catch that only reaches console.error, or one that puts a Firebase SDK
 * message straight on screen. lib/errors.ts is the one place that decides what
 * a person sees, so it is the one place worth pinning down.
 */
import assert from 'node:assert/strict';
import { toUserMessage, reportError } from '../src/lib/errors';

// Known codes map to sentences, not codes.
for (const code of ['auth/invalid-credential', 'auth/email-already-in-use', 'permission-denied', 'unauthenticated']) {
  const msg = toUserMessage({ code });
  assert.ok(msg && !msg.includes(code), `${code} leaked its code to the user: ${msg}`);
  assert.ok(/[.!]$/.test(msg), `${code} produced something that is not a sentence: ${msg}`);
}

// permission-denied must not accuse the user — it usually means our rules and
// our code disagree, not that they did anything wrong.
assert.ok(/contact support/i.test(toUserMessage({ code: 'permission-denied' })));

// A prefixed Firestore code still resolves.
assert.equal(toUserMessage({ code: 'firestore/permission-denied' }), toUserMessage({ code: 'permission-denied' }));

// Unknown provider codes fall back rather than leaking.
const unknown = toUserMessage({ code: 'auth/some-future-code', message: 'FIREBASE INTERNAL: projects/x/databases/y' });
assert.ok(!unknown.includes('FIREBASE'), 'an unmapped SDK error leaked its raw message');
assert.ok(!unknown.includes('projects/'), 'an unmapped SDK error leaked internal paths');

// A caller-supplied fallback is preferred over the generic one, so messages can
// say what actually failed.
assert.equal(toUserMessage(new Error(''), "Couldn't save your profile."), "Couldn't save your profile.");

// Our own thrown strings are already user-facing.
assert.equal(toUserMessage('Your session has expired.'), 'Your session has expired.');

// Never returns empty — an empty error banner is a button that did nothing.
for (const v of [null, undefined, {}, 0, [], new Error('')]) {
  assert.ok(toUserMessage(v).length > 0, `returned nothing for ${JSON.stringify(v)}`);
}

// reportError logs and still returns a usable message.
const original = console.error;
let logged = false;
console.error = () => { logged = true; };
const returned = reportError('test', { code: 'unavailable' });
console.error = original;
assert.ok(logged, 'reportError did not log the original error');
assert.ok(returned.length > 0, 'reportError returned nothing to show the user');

console.log('[PASS] errors: maps known codes, never leaks raw SDK text, never returns empty');
