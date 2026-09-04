import { useEffect, useState } from 'react';
import { KeyRound, Download } from 'lucide-react';
import { API_BASE_URL } from '../lib/config';
import { auth } from '../firebase/config';
import { reportError } from '../lib/errors';

/**
 * Recovery codes, from the organisation's side.
 *
 * Two-step sign-in is mandatory for organisations and the code arrives by
 * email, so a bounced address, a departed staff member or a school spam filter
 * used to lock an organisation out of its own dashboard permanently. The only
 * way back was writing to us and waiting for a developer to run a script.
 *
 * Ten single-use codes fix that without a second channel to pay for. They are
 * shown ONCE, at generation, because only their hashes are kept — nobody,
 * including us, can recover them afterwards. That is the property that makes
 * them worth having, so the UI has to be honest that this is the only time.
 */
export default function RecoveryCodes() {
  const [status, setStatus] = useState<{ exists: boolean; remaining: number } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch(`${API_BASE_URL}/api/auth/backup-codes/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setStatus(await res.json());
    } catch {
      // Non-blocking: the generate button still works without a count.
    }
  };

  useEffect(() => { loadStatus(); }, []);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/auth/backup-codes`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: '{}',
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
      setCodes(body.codes);
      await loadStatus();
    } catch (err: any) {
      setError(reportError('generate recovery codes', err,
        'Could not create recovery codes just now. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  /**
   * A plain text file rather than a clipboard copy.
   *
   * These need to survive being lost, which means leaving the machine they were
   * generated on. A clipboard does not do that, and a screenshot of ten codes
   * usually ends up in the same mailbox that just failed.
   */
  const download = () => {
    if (!codes) return;
    const body = [
      'Volunteer North York recovery codes',
      `Account: ${auth.currentUser?.email || ''}`,
      `Generated: ${new Date().toLocaleString()}`,
      '',
      'Each code works once. Use one in place of the emailed sign-in code if',
      'you cannot reach your email. Keep this somewhere safe and private.',
      'anyone holding a code can sign in as this account.',
      '',
      ...codes.map((c, i) => `${String(i + 1).padStart(2, ' ')}.  ${c}`),
    ].join('\n');
    const url = URL.createObjectURL(new Blob([body], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'volunteer-north-york-recovery-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="border-t border-line-light pt-4 space-y-3">
      <div>
        <h4 className="text-xs font-semibold text-ink-soft flex items-center gap-1.5">
          <KeyRound className="w-3.5 h-3.5" /> Recovery codes
        </h4>
        <p className="text-sm text-ink-soft mt-1 leading-relaxed">
          If you ever cannot reach the email on this account, a recovery code lets you
          sign in anyway. Without one, getting back in means contacting us and waiting.
        </p>
      </div>

      {codes ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
          <p className="text-sm font-semibold text-amber-900">
            Save these now. This is the only time they are shown.
          </p>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-sm text-ink">
            {codes.map((c) => <li key={c}>{c}</li>)}
          </ul>
          <button
            type="button"
            onClick={download}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-blue-dark text-white text-xs font-semibold"
          >
            <Download className="w-3.5 h-3.5" /> Download as a file
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-ink-muted">
            {status?.exists
              ? `${status.remaining} of 10 unused`
              : 'You have not created any yet.'}
          </p>
          <button
            type="button"
            onClick={generate}
            disabled={busy}
            className="h-9 px-3 rounded-lg border border-line bg-white text-xs font-semibold text-ink hover:border-blue-dark/40 disabled:opacity-50"
          >
            {busy ? 'Creating…' : status?.exists ? 'Create new codes' : 'Create recovery codes'}
          </button>
        </div>
      )}

      {status?.exists && !codes && (
        <p className="text-sm text-ink-muted">
          Creating new codes cancels the old ones.
        </p>
      )}

      {error && <p role="alert" className="text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}
