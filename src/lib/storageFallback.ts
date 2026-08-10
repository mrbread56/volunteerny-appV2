/**
 * Keep the app alive when the browser refuses localStorage.
 *
 * `localStorage` is not always there. Chrome throws a SecurityError on every
 * access — not just on write — when the user blocks cookies and site data for
 * the origin, and Safari has historically thrown on setItem once the private
 * quota fills. This app reads localStorage in 135 places across src/, none of
 * them guarded, several of them during startup in AuthContext and the
 * dashboards. One throw there is an unhandled exception before React has
 * mounted anything, so the student gets a blank white page with no error and
 * no way forward.
 *
 * That is not a hypothetical: this very failure was hit while testing the app
 * in a sandboxed browser, which denies storage exactly the way a privacy-minded
 * student's browser does. Our own cookie banner invites people to make that
 * choice.
 *
 * Wrapping 135 call sites would be 135 chances to miss one. Instead this
 * replaces the object itself, once, before any of them run — so every existing
 * `localStorage.getItem(...)` keeps working unchanged and simply operates on
 * memory instead of disk. Data does not survive a reload in that mode, which is
 * the correct outcome: the user asked for nothing to be persisted.
 *
 * ponytail: in-memory Map, per-tab and lost on reload. If a feature ever needs
 * durable storage under a storage block, that feature needs a server, not a
 * better shim here.
 */

function storageWorks(): boolean {
  try {
    // Touch it the way the app does. Merely referencing window.localStorage is
    // enough to throw when the origin is blocked, so the access itself is the
    // test — and a get/set round trip additionally catches the quota case.
    const probe = '__vny_storage_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      // Storage returns null for a miss, never undefined.
      return map.has(String(key)) ? map.get(String(key))! : null;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(String(key));
    },
    setItem(key: string, value: string) {
      map.set(String(key), String(value));
    },
  } as Storage;
}

/**
 * Returns true if the real localStorage is usable, false if the in-memory
 * stand-in was installed.
 *
 * This runs as a SIDE EFFECT of importing this module (see the bottom of the
 * file), not from a call in main.tsx. It has to: every `import` declaration in
 * an ES module is evaluated before any statement in that module's body, so a
 * call placed in main.tsx would run only after App.tsx and its whole import
 * graph had already been evaluated — and any module-level storage read in that
 * graph would already have thrown. Importing this file first is the only
 * ordering the language actually guarantees.
 */
export function installStorageFallback(): boolean {
  if (typeof window === 'undefined') return false;
  if (storageWorks()) return true;

  const memory = createMemoryStorage();
  try {
    // localStorage is an accessor on the window prototype, not an own value
    // property, so it is redefined rather than assigned.
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => memory,
    });
  } catch {
    // Some environments refuse the redefine. Nothing further to try — but the
    // app is no worse off than before this file existed, and the warning below
    // is the only clue anyone would otherwise get.
    console.warn(
      '[storage] This browser blocks localStorage and it could not be replaced. ' +
        'Parts of the app that remember state will fail.',
    );
    return false;
  }

  console.warn(
    '[storage] This browser is blocking site data, so nothing will be remembered ' +
      'after you close the tab. Allow cookies for this site to stay signed in.',
  );
  return false;
}

// Run on import. See the note on installStorageFallback for why this cannot be
// a call in main.tsx.
installStorageFallback();
