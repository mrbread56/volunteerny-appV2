/**
 * The notification bell in the navbar.
 *
 * Data comes from src/lib/notifications.ts, which derives notifications from
 * documents the signed-in user can already read — there is no notifications
 * collection. See the comment at the top of that file for why.
 *
 * Deliberately not a live subscription. It fetches when opened and when the
 * account changes; a student checking whether they got in does not need a
 * websocket, and an onSnapshot per session is a cost with no matching benefit
 * at this size.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCircle2, XCircle, Clock, Eye, UserPlus, AlertCircle, MessageSquare, ShieldCheck, Award, Star, BadgeCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { reportError } from '../lib/errors';
import {
  fetchNotifications,
  getSeenAt,
  markAllSeen,
  countUnread,
  type AppNotification,
  type NotificationKind,
} from '../lib/notifications';

const ICONS: Record<NotificationKind, typeof Bell> = {
  accepted: CheckCircle2,
  rejected: XCircle,
  waitlist: Clock,
  reviewed: Eye,
  hours: CheckCircle2,
  applicant: UserPlus,
  feedbackReply: MessageSquare,
  reportResolved: ShieldCheck,
  recommendation: Award,
  rating: Star,
  verified: BadgeCheck,
  hoursPending: Clock,
};

const TONE: Record<NotificationKind, string> = {
  accepted: 'text-emerald-600 bg-emerald-50',
  rejected: 'text-ink-muted bg-slate-100',
  waitlist: 'text-amber-600 bg-amber-50',
  reviewed: 'text-blue-600 bg-blue-50',
  hours: 'text-emerald-600 bg-emerald-50',
  applicant: 'text-blue-600 bg-blue-50',
  feedbackReply: 'text-blue-600 bg-blue-50',
  reportResolved: 'text-emerald-600 bg-emerald-50',
  recommendation: 'text-violet-600 bg-violet-50',
  rating: 'text-amber-600 bg-amber-50',
  verified: 'text-emerald-600 bg-emerald-50',
  hoursPending: 'text-amber-600 bg-amber-50',
};

function relativeTime(d: Date): string {
  // toLocaleDateString() on an Invalid Date throws RangeError, and this runs
  // inside render — so an unparseable timestamp would blank the whole page
  // rather than one line of a dropdown.
  if (!(d instanceof Date) || !Number.isFinite(d.getTime())) return '';
  const ms = Date.now() - d.getTime();
  if (ms < 0 || !Number.isFinite(ms)) return '';
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

export default function NotificationBell() {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const role = userProfile?.role;
  const uid = user?.uid;

  // While the panel is open everything in it counts as read, so a refetch that
  // lands mid-view must not put the badge back.
  const openRef = useRef(false);

  const load = useCallback(async () => {
    if (!uid || (role !== 'student' && role !== 'organization')) return;
    setLoading(true);
    setError(null);
    try {
      const next = await fetchNotifications(uid, role, user?.email || undefined);
      setItems(next);
      if (openRef.current) {
        markAllSeen(uid, next);
        setUnread(0);
      } else {
        setUnread(countUnread(next, getSeenAt(uid)));
      }
    } catch (err) {
      // Says so rather than rendering an empty bell, which would be
      // indistinguishable from having no notifications.
      setError(reportError('load notifications', err, "Couldn't load your notifications."));
    } finally {
      setLoading(false);
    }
  }, [uid, role, user?.email]);

  // Once per session per account, for the badge. Opening refetches.
  useEffect(() => {
    void load();
  }, [load]);

  // Keep the ref in step with every close path — Escape, outside click, and
  // following a notification — not just the toggle.
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  // Close on outside click and on Escape, returning focus to the button so a
  // keyboard user is not dropped at the top of the document.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!uid || (role !== 'student' && role !== 'organization')) return null;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    openRef.current = next;
    if (next) {
      // Not while the last load is known to have failed. `items` then holds
      // whatever survived from before — usually nothing — and treating that as
      // "everything the reader has seen" is how an unfetched notification gets
      // marked read. The refetch below sets the badge honestly either way.
      if (!error) {
        markAllSeen(uid, items);
        setUnread(0);
      }
      void load();
    }
  };

  const go = (href: string) => {
    setOpen(false);
    navigate(href);
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative p-2 rounded-lg text-ink-soft hover:text-ink hover:bg-paper-2 transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="region"
          aria-label="Notifications"
          className="absolute right-0 mt-2 w-[min(360px,calc(100vw-2rem))] max-h-[420px] overflow-y-auto rounded-xl border border-line bg-white shadow-lg z-50"
        >
          <div className="px-4 py-3 border-b border-line-light">
            <p className="text-sm font-bold text-ink">Notifications</p>
          </div>

          {loading && <p className="px-4 py-6 text-sm text-ink-muted">Loading…</p>}

          {!loading && error && (
            <div className="px-4 py-5 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-ink">{error}</p>
                <button
                  type="button"
                  onClick={() => void load()}
                  className="mt-2 text-xs font-semibold text-blue-dark hover:underline"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {!loading && !error && items.length === 0 && (
            <p className="px-4 py-8 text-sm text-ink-muted text-center">
              Nothing yet. Updates about your{' '}
              {role === 'student' ? 'applications and hours' : 'opportunities'} will show up here.
            </p>
          )}

          {!loading && !error && items.length > 0 && (
            <ul className="divide-y divide-line-light">
              {items.map((n) => {
                const Icon = ICONS[n.kind];
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => go(n.href)}
                      className="w-full text-left px-4 py-3 flex gap-3 hover:bg-paper-2 transition-colors"
                    >
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${TONE[n.kind]}`}>
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-ink">{n.title}</span>
                        <span className="block text-xs text-ink-muted leading-relaxed mt-0.5">{n.body}</span>
                        <span className="block text-[11px] text-ink-muted mt-1">{relativeTime(n.at)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
