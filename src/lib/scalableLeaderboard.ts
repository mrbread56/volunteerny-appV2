import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { API_BASE_URL } from './config';

export interface LeaderboardEntry {
  // null for a student who set trackerAnonymous. See rebuildGlobalLeaderboard
  // in server.ts: publishing the uid beside "Anonymous Student" let anyone
  // holding a uid -> name map undo the anonymity.
  userId: string | null;
  name: string;
  score: number;
  updatedAt: any;
}

// submitUserScore() used to live here: an increment() write to
// students/{uid}.hours, described as the "high-throughput write operation". It
// had zero callers, so the scalar the leaderboard orders by was never written
// and every student ranked at 0. The total is now recomputed from loggedHours
// by whoever approves the hours (see src/lib/hours.ts) — deleted rather than
// wired up, because an increment racing that recompute would double-count, and
// it also silently set trackerEnabled: true, opting students back into a
// ranking they may have left.

/**
 * Ask the server to rebuild /leaderboards/global_top.
 *
 * This replaces a client-side aggregateGlobalLeaderboard() that could never
 * have worked: firestore.rules allows `list` on /students only to the owner or
 * a developer, and `write` on /leaderboards only to a developer. Aggregation is
 * a privileged cross-user read, so it runs on the server's Admin SDK. Nothing
 * called the old function either, which is why the board was always empty.
 *
 * Fire-and-forget: the caller's own write has already succeeded by this point,
 * and the server also rebuilds on a 15-minute timer, so a failure here is not
 * worth surfacing to the user.
 */
export async function requestLeaderboardRebuild(): Promise<void> {
  try {
    const user = auth.currentUser;
    let token: string | null = null;
    if (user) token = await user.getIdToken();
    if (!token) {
      const demoRole = localStorage.getItem('demo_mode_role');
      if (demoRole) token = `demo-mode-token-${demoRole}`;
    }
    if (!token) return;

    await fetch(`${API_BASE_URL}/api/leaderboard/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    console.warn('[leaderboard] rebuild request failed:', err);
  }
}

/**
 * --------------------------------------------------------------------------
 * 3. THE SCALABILITY MIRACLE: REAL-TIME CLIENT-SIDE LEADERBOARD SUBSCRIPTION
 * --------------------------------------------------------------------------
 * To serve thousands of concurrent players cleanly in <500ms without triggering 
 * huge read cost amplification (which occurs if each client makes queries containing 
 * multiple document lookups), players subscribe directly to the materialized 
 * single document `/leaderboards/global_top`.
 * 
 * This reduces read complexity down to exactly O(1) read per client per update,
 * enabling near-instantaneous load times and complete resilience to high-traffic spikes.
 */
export function subscribeToScalableLeaderboard(
  onUpdate: (entries: LeaderboardEntry[]) => void, 
  onError?: (err: Error) => void
): () => void {
  const docRef = doc(db, 'leaderboards', 'global_top');
  
  // Real-time listener on the single materialized leaderboard document
  const unsubscribe = onSnapshot(docRef, (docSnapshot) => {
    if (docSnapshot.exists()) {
      const data = docSnapshot.data();
      onUpdate(data.entries || []);
    } else {
      onUpdate([]);
    }
  }, (err) => {
    console.error('Error listening to high-scale leaderboard:', err);
    if (onError) onError(err);
  });
  
  // Returns the unsubscribe function to nicely clean up listener on Component unmount
  return unsubscribe;
}
