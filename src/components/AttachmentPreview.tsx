import { useEffect, useState } from 'react';
import { decompressFile } from '../utils/compress';

/**
 * Renders a preview/download block for a feedback or safety-report attachment.
 *
 * Handles both attachment generations:
 *  - Legacy: base64 data URIs, optionally LZ-String compressed (`lzs::…`),
 *    stored inline in the Firestore document.
 *  - Current: Firebase Storage download URLs (https://…). The document only
 *    carries the URL; the bytes live in Storage under feedbacks/{uid}/… or
 *    reports/{uid}/… (see storage.rules).
 *
 * `value` may be either representation; callers pass whichever field the
 * document carries (attachmentUrl for new documents, attachmentData for old).
 */
export default function AttachmentPreview({
  value,
  name,
}: {
  value: string | null | undefined;
  name?: string | null;
}) {
  /*
   * Three generations now, not two.
   *
   * uploadFileToStorage was changed to store `storage:<path>` instead of a
   * permanent getDownloadURL token, because that token bypasses storage.rules
   * and never expires. That change landed for ALL THREE of its call sites —
   * resumes, safety-report evidence and feedback attachments — but only the
   * resume path grew a resolver, on the server inside review-profile.
   *
   * So a moderator opening a safety report saw "Download File (shot.png)" over
   * an href of `storage:reports/{uid}/shot.png`, which is not a URL scheme:
   * no preview, no download, no error. That is the evidence attached to a
   * report about an adult, and it is the one attachment nobody can afford to
   * lose sight of.
   *
   * Resolved here through the Storage SDK rather than a token, so the read is
   * governed by storage.rules — which already permits a developer to read
   * reports/ and feedbacks/ — and the resulting blob URL dies with the tab.
   */
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [resolveFailed, setResolveFailed] = useState(false);
  const raw = value ? decompressFile(value) : '';
  const isStoragePath = raw.startsWith('storage:') && raw !== 'storage:unavailable';

  useEffect(() => {
    if (!isStoragePath) return;
    let cancelled = false;
    let created = '';
    (async () => {
      try {
        const [{ getStorage, ref, getBlob }, { app }] = await Promise.all([
          import('firebase/storage'),
          import('../firebase/config'),
        ]);
        const blob = await getBlob(ref(getStorage(app), raw.slice('storage:'.length)));
        if (cancelled) return;
        created = URL.createObjectURL(blob);
        setBlobUrl(created);
      } catch (err) {
        console.error('[AttachmentPreview] could not load', raw, err);
        if (!cancelled) setResolveFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      // Revoked, or every report a moderator opens leaks its evidence for the
      // lifetime of the tab.
      if (created) URL.revokeObjectURL(created);
    };
  }, [raw, isStoragePath]);

  if (!value) return null;

  // A signing failure is NOT "nothing was attached". The server returns this
  // sentinel rather than an empty string precisely so the two can be told
  // apart here.
  if (raw === 'storage:unavailable' || resolveFailed) {
    return (
      <p className="mt-2 text-xs text-amber-700 font-semibold">
        We could not load this attachment right now. It is still stored; try again shortly.
      </p>
    );
  }

  if (isStoragePath && !blobUrl) {
    return <p className="mt-2 text-xs text-ink-muted font-medium">Loading attachment…</p>;
  }

  const resolved = isStoragePath ? (blobUrl as string) : raw;
  const fileName = name || 'attachment';

  /*
   * Only schemes that can carry a file, checked before anything is rendered.
   *
   * `resolved` reaches an <a href>, an <img src>, an <iframe src> AND a raw
   * DOM anchor in triggerDownload below. attachmentUrl is written by the
   * reporter — firestore.rules caps it at 1000 characters and checks nothing
   * else — and the raw-DOM assignment is outside React, so React's URL
   * sanitizer never runs and a programmatic click on a `javascript:` href
   * executes even with `download` set.
   *
   * This component renders in the Control Room's safety-report evidence
   * viewer, so the session at risk is a moderator's: the one account that can
   * read every report, every student and every organisation.
   */
  if (!/^(https?:|data:|blob:)/i.test(resolved)) {
    return (
      <p className="mt-2 text-xs text-amber-700 font-semibold">
        This attachment could not be shown because its link is not a file we can open.
      </p>
    );
  }

  // blob: is same-origin, so `download` works and no new tab is wanted.
  const isUrl = resolved.startsWith('http://') || resolved.startsWith('https://');
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  // The extension test has to cover blob: too, or a Storage-backed screenshot
  // falls through to the generic "Document attachment" branch and never
  // previews.
  const byName = isUrl || resolved.startsWith('blob:');
  const looksLikeImage =
    resolved.startsWith('data:image/') ||
    (byName && ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext));
  const looksLikePdf =
    resolved.startsWith('data:application/pdf') || (byName && ext === 'pdf');

  const triggerDownload = () => {
    // For same-document data URIs the `download` attribute works; for
    // cross-origin Storage URLs the browser ignores it and simply opens the
    // file, which is the best a client can do without a proxy.
    const link = document.createElement('a');
    link.href = resolved;
    link.download = fileName;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="mt-2 p-3 bg-white border border-line-light rounded-lg overflow-hidden max-w-md">
      <p className="text-xs font-bold uppercase text-ink-muted font-mono tracking-wider mb-2">
        Attachment Preview:
      </p>
      {looksLikeImage ? (
        /* An <a download>, like the two branches below. This was a bare <img
           onClick> with no role, tabIndex or key handler, so it was mouse-only
           — and it renders in the developer console's safety-report evidence
           viewer, which meant a moderator navigating by keyboard could not open
           the screenshot attached to a report about an adult. The siblings had
           the right pattern all along. */
        <a
          href={resolved}
          download={fileName}
          target={isUrl ? '_blank' : undefined}
          rel={isUrl ? 'noopener noreferrer' : undefined}
          onClick={(e) => { if (!isUrl) { e.preventDefault(); triggerDownload(); } }}
          className="block rounded-lg"
          aria-label={`Open attachment ${fileName}`}
        >
          <img
            src={resolved}
            alt={fileName}
            loading="lazy"
            width={800}
            height={600}
            className="w-full aspect-video max-h-72 object-contain rounded-lg hover:scale-[1.02] transition-transform duration-300 border border-line/60 cursor-pointer mx-auto"
          />
        </a>
      ) : looksLikePdf ? (
        <div className="space-y-2">
          {/* sandbox, because this frame renders a file an untrusted account
              uploaded. looksLikePdf accepts any Storage URL whose stored
              attachmentName merely ENDS in .pdf, and that name is client-written
              free text — so the bytes need not be a PDF at all. allow-same-origin
              without allow-scripts keeps the browser's PDF viewer working while
              denying script execution and top-level navigation. */}
          {/* Framed only if it is OUR file.
              The branch is chosen by attachmentName merely ending in ".pdf",
              and that name is reporter-written free text, so any https URL
              could be framed as a report's evidence. The sandbox denies
              scripts, but it still put an attacker's page where a moderator
              expects the evidence — and the load itself told them the moment
              their report was opened. A blob: URL is our own fetched bytes. */}
          {(resolved.startsWith('blob:') || resolved.startsWith('data:')) ? (
            <iframe
              src={resolved}
              title={fileName}
              sandbox="allow-same-origin"
              referrerPolicy="no-referrer"
              className="w-full h-64 rounded-lg border border-line bg-paper-2"
            />
          ) : (
            <p className="text-xs text-ink-muted font-medium p-3 bg-paper-2 rounded-lg border border-line">
              Preview is off for files stored outside this site. Use the download link below.
            </p>
          )}
          <a
            aria-label="Download attachment"
            href={resolved}
            download={fileName}
            target={isUrl ? '_blank' : undefined}
            rel={isUrl ? 'noopener noreferrer' : undefined}
            className="text-xs font-bold text-blue-dark hover:text-[#153343] hover:underline block"
          >
            Download PDF Attachment
          </a>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <span className="text-ink-muted font-medium">
            Document attachment.
          </span>
          <a
            aria-label="Download attachment"
            href={resolved}
            download={fileName}
            target={isUrl ? '_blank' : undefined}
            rel={isUrl ? 'noopener noreferrer' : undefined}
            className="px-3.5 py-2 bg-paper-3 hover:bg-slate-200 rounded-lg text-ink-soft font-semibold text-xs inline-flex items-center gap-1.5 w-fit"
          >
            Download File ({fileName})
          </a>
        </div>
      )}
    </div>
  );
}
