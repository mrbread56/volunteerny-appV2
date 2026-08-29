import { test, expect } from '@playwright/test';
import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import dotenv from 'dotenv';

dotenv.config();

/**
 * The health endpoints, exercised in both directions.
 *
 * A monitoring check that has never failed proves nothing — it may be reporting
 * health it does not measure, which is worse than no check because it is
 * trusted. So this boots the real server twice: once configured, where /health
 * must return 200, and once with a deliberately removed variable, where it must
 * return 503 AND name the missing thing.
 *
 * The shallow endpoint is public, so it is also asserted to leak nothing: no
 * secret values, no error strings, no service-account address.
 */
// Serial. The config sets fullyParallel, which splits these across workers —
// and each one boots a real server on the SAME port, so they fight over the
// bind and whichever loses reports a failure that has nothing to do with the
// endpoint. They pass individually and fail together, which is the signature.
test.describe.configure({ mode: 'serial' });

const PORT = 3205;
const BASE = `http://127.0.0.1:${PORT}`;

async function boot(env: NodeJS.ProcessEnv, cwd = process.cwd()): Promise<ChildProcess> {
  // Absolute path to the bundle, because cwd is sometimes moved away from the
  // project to starve the child of .env — see the failure-direction test.
  const entry = path.resolve('build/server.cjs');
  const proc = spawn(process.execPath, [entry], {
    cwd,
    env: { ...env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  proc.stdout?.on('data', (d) => { log += d.toString(); });
  proc.stderr?.on('data', (d) => { log += d.toString(); });
  for (let i = 0; i < 60; i++) {
    if (proc.exitCode !== null) throw new Error(`server exited ${proc.exitCode}:\n${log}`);
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.status === 200 || r.status === 503) return proc;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  proc.kill();
  throw new Error(`server never answered:\n${log}`);
}

test('a correctly configured server reports healthy, and leaks nothing', async () => {
  test.setTimeout(120000);
  const proc = await boot({ ...process.env, NODE_ENV: 'production' });
  try {
    const res = await fetch(`${BASE}/api/health`);
    expect(res.status, 'a fully configured server should be 200').toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);

    // The public answer is the STATUS CODE and nothing else. Per-check booleans
    // and the commit sha used to be here, which told an anonymous caller which
    // subsystem was unconfigured — including whether CRON_SECRET exists, and so
    // whether the cron and deep-health routes are reachable at all.
    expect(Object.keys(body), 'the public endpoint must expose only { ok }').toEqual(['ok']);

    const raw = JSON.stringify(body);
    expect(raw, 'must not echo the service account').not.toContain('iam.gserviceaccount.com');
    expect(raw, 'must not echo the Resend key').not.toContain(String(process.env.RESEND_API_KEY));
    expect(raw, 'must not echo the cron secret').not.toContain(String(process.env.CRON_SECRET));
    expect(raw, 'must not echo the database id').not.toContain(String(process.env.FIREBASE_DATABASE_ID));
    expect(res.headers.get('cache-control')).toContain('no-store');
  } finally {
    proc.kill();
  }
});

test('missing configuration turns the check red and names what is missing', async () => {
  test.setTimeout(120000);
  // The failure direction — without it, the endpoint could be hard-coded to 200
  // and nobody would find out until the outage it exists to catch.
  //
  // Deleting a variable from the spawn env is NOT enough: the server calls
  // dotenv at load, which reads .env off disk and puts it straight back. The
  // first version of this test did exactly that, saw a green 200, and was
  // measuring nothing. So the child is run from a directory that HAS no .env.
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'vny-health-'));
  const proc = await boot(
    {
      NODE_ENV: 'production',
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      // Nothing else. No key, no database id, no mail config, no cron secret.
    } as NodeJS.ProcessEnv,
    bare,
  );
  try {
    const res = await fetch(`${BASE}/api/health`);
    expect(res.status, 'an unconfigured server must not report healthy').toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    // Still only { ok } — a broken server must not become more talkative than a
    // healthy one, or the failure path becomes the reconnaissance path.
    expect(Object.keys(body)).toEqual(['ok']);
  } finally {
    // Wait for the child to actually exit before removing the directory.
    // Windows refuses to delete a directory that is still a live process's cwd,
    // so rmSync straight after kill() throws EPERM — a cleanup failure that
    // fails the test and looks exactly like a real one.
    const exited = new Promise<void>((resolve) => proc.once('exit', () => resolve()));
    proc.kill();
    await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
    try {
      fs.rmSync(bare, { recursive: true, force: true });
    } catch {
      /* the OS reclaims its own temp directory; never fail the test on this */
    }
  }
});

test('the deep check refuses anyone without the cron secret', async () => {
  test.setTimeout(120000);
  const proc = await boot({ ...process.env, NODE_ENV: 'production' });
  try {
    expect((await fetch(`${BASE}/api/health/deep`)).status).toBe(401);
    expect((await fetch(`${BASE}/api/health/deep`, {
      headers: { Authorization: 'Bearer wrong-secret' },
    })).status).toBe(401);

    const good = await fetch(`${BASE}/api/health/deep`, {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    // 200 healthy or 503 degraded are both valid answers; 401 is not.
    expect([200, 503]).toContain(good.status);
    const body = await good.json();
    // The number that had never been read by anything.
    expect(typeof body.clientErrors24h === 'number' || body.firestore === 'unreachable').toBe(true);
    // The detail lives HERE now, behind the bearer, rather than on the public route.
    if (body.checks) {
      for (const key of ['adminInit', 'databaseId', 'mailFrom', 'resendKey']) {
        expect(body.checks[key], `${key} should be reported`).toBe(true);
      }
    }
  } finally {
    proc.kill();
  }
});
