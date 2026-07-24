// Small helper so pages like the org applicants dashboard can tell the
// Messages page "open (or create) a direct chat with this user" without a
// big prop-drilling refactor. Messages.tsx listens for this event.

export const OPEN_CHAT_EVENT = "vny:open-direct-chat";

export interface OpenChatRequestDetail {
  otherUserId: string;
  otherUserLabel?: string;
}

let lastRequest: OpenChatRequestDetail | null = null;

export function requestOpenDirectChat(otherUserId: string, otherUserLabel?: string) {
  if (typeof window === "undefined") return;
  lastRequest = { otherUserId, otherUserLabel };
  window.dispatchEvent(
    new CustomEvent<OpenChatRequestDetail>(OPEN_CHAT_EVENT, { detail: lastRequest })
  );
}

/**
 * Messages.tsx calls this once on mount to pick up a request that was fired
 * a moment before it finished mounting (e.g. navigate('/messages') followed
 * immediately by requestOpenDirectChat from another page).
 */
export function consumeLastOpenChatRequest(): OpenChatRequestDetail | null {
  const r = lastRequest;
  lastRequest = null;
  return r;
}

/** Deterministic direct-chat id for a pair of users, order-independent. */
export function directChatId(uidA: string, uidB: string): string {
  return `dm_${[uidA, uidB].sort().join("_")}`;
}

/** Deterministic group-chat id for an opportunity. */
export function groupChatId(opportunityId: string): string {
  return `group_${opportunityId}`;
}
