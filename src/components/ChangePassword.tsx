import { useState } from 'react';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { KeyRound } from 'lucide-react';
import { auth } from '../firebase/config';
import { reportError } from '../lib/errors';
import { useAuth } from '../contexts/AuthContext';
import { validatePasswordChange, FIREBASE_MIN_PASSWORD } from '../lib/passwordChange';
import { Input } from './ui/Input';

/**
 * Changing your own password, from either profile page.
 *
 * Firebase will not change a password on an old session — updatePassword throws
 * auth/requires-recent-login once the sign-in ages out. The usual fix is to
 * catch that error and send the person back to the login screen, which loses
 * whatever they typed. Reauthenticating first makes the error unreachable
 * instead: the credential we verify IS the recent login Firebase is asking for,
 * so the age of the session stops mattering and nobody gets bounced.
 *
 * That check also has to happen for its own sake. Without it, an unlocked
 * laptop is a permanent account takeover — anyone walking past could set a new
 * password without proving they knew the old one, and the real owner would be
 * locked out of an account that still looks like theirs.
 */
export default function ChangePassword() {
  const { user, isDemoMode, loading } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  /*
   * The signed-in person comes from the context, NOT from auth.currentUser.
   *
   * auth.currentUser is null for the first moments after a page load, while the
   * SDK restores the session from IndexedDB, and reading it directly is not
   * reactive — nothing re-renders when it fills in. This component then decided
   * there was no password provider, rendered the "you sign in with Google"
   * branch, and stayed that way: on a hard refresh of the profile page the box
   * simply was not there. The context tracks onAuthStateChanged, so it settles.
   */
  const hasPassword =
    isDemoMode || (user?.providerData?.some((p) => p.providerId === 'password') ?? false);

  const submit = async () => {
    setError(null);
    setDone(false);

    const complaint = validatePasswordChange(current, next, confirm);
    if (complaint) {
      setError(complaint);
      return;
    }
    // Firebase mutates its own User object in place, so the SDK's handle is the
    // one to hand back to it; the context's copy is only for deciding what to
    // draw.
    const live = auth.currentUser;
    if (!live?.email) {
      setError('You are not signed in. Please sign in again and retry.');
      return;
    }

    setBusy(true);
    try {
      await reauthenticateWithCredential(live, EmailAuthProvider.credential(live.email, current));
      await updatePassword(live, next);
      setDone(true);
      // Clearing on success matters more than it looks: these boxes sit on a
      // profile page people leave open, and a filled-in password field is one
      // stray autofill away from being submitted somewhere else.
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err: any) {
      // Firebase reports a wrong current password as auth/invalid-credential,
      // whose shared wording ("Incorrect email or password") names an email
      // field this form does not have. Answer the question actually asked.
      const code = err?.code;
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        setError('That current password is not right.');
      } else {
        setError(reportError('change password', err,
          'Could not change your password just now. Please try again.'));
      }
    } finally {
      setBusy(false);
    }
  };

  // Nothing at all while the session is still being restored: an empty frame is
  // honest, where either branch of this component would be a guess.
  if (loading) return null;

  if (!hasPassword) {
    return (
      <div className="border-t border-line-light pt-4 space-y-2">
        <h4 className="text-xs font-semibold text-ink-soft flex items-center gap-1.5">
          <KeyRound className="w-3.5 h-3.5" /> Password
        </h4>
        <p className="text-xs text-ink-soft leading-relaxed">
          You sign in with Google, so there is no password on this account to change.
          Manage it in your Google account settings.
        </p>
      </div>
    );
  }

  return (
    /*
     * A div, not a form, and the reason is not cosmetic. Both profile pages
     * wrap their whole body in a single <form>, and HTML has no nested forms:
     * the parser silently drops the inner tag, so onSubmit would never fire and
     * this button would submit the PROFILE form instead. Saving someone's
     * profile when they asked to change their password is the kind of bug that
     * looks like the site ignored the click.
     *
     * Enter is wired up by hand below to keep what the form element gave us.
     */
    <div
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (!busy && !isDemoMode) void submit();
        }
      }}
      className="border-t border-line-light pt-4 space-y-3"
    >
      <div>
        <h4 className="text-xs font-semibold text-ink-soft flex items-center gap-1.5">
          <KeyRound className="w-3.5 h-3.5" /> Change password
        </h4>
        <p className="text-xs text-ink-soft mt-1 leading-relaxed">
          Set your own password here. You stay signed in, and if your account uses two-step sign-in you will be asked for a fresh code afterwards.
        </p>
      </div>

      <Input
        label="Current password"
        type="password"
        autoComplete="current-password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
      />
      <Input
        label="New password"
        type="password"
        autoComplete="new-password"
        placeholder={`At least ${FIREBASE_MIN_PASSWORD} characters`}
        value={next}
        onChange={(e) => setNext(e.target.value)}
      />
      <Input
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />

      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy || isDemoMode}
        className="h-9 px-3 rounded-lg border border-line bg-white text-xs font-semibold text-ink hover:border-blue-dark/40 disabled:opacity-50"
      >
        {busy ? 'Changing…' : 'Change password'}
      </button>

      {isDemoMode && (
        <p className="text-xs text-ink-muted">
          The demo account cannot change its password.
        </p>
      )}
      {error && <p role="alert" className="text-xs font-semibold text-red-600">{error}</p>}
      {done && (
        <p role="status" className="text-xs font-semibold text-emerald-700">
          Password changed. Use the new one next time you sign in. If you are asked for a code now, that is expected — changing a password starts a new session.
        </p>
      )}
    </div>
  );
}
