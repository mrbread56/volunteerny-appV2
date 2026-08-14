// Its own module, with no Firebase import.
//
// This lived in emailService.ts, which imports firebase/config — and that
// reads import.meta.env, so a test could not import this pure function
// without dragging the whole client SDK and a Vite-only global in with it.

/**
 * A `mailto:` link that only fills in the recipients.
 *
 * Deliberately no subject and no body: the point is to drop the organization
 * into their own inbox with the addresses already there, not to put words in
 * their mouth.
 *
 * Several recipients go in BCC, never TO. The recipients here are volunteers,
 * most of them minors — putting twenty of their addresses in a visible To field
 * would disclose every one of them to the other nineteen.
 */
export function buildMailtoLink(emails: string[]): string | null {
  const clean = emails.filter((e) => typeof e === 'string' && e.includes('@'));
  if (clean.length === 0) return null;
  if (clean.length === 1) return `mailto:${encodeURIComponent(clean[0])}`;
  return `mailto:?bcc=${clean.map(encodeURIComponent).join(',')}`;
}
