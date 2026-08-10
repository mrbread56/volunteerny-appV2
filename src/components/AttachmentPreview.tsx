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
  if (!value) return null;

  // decompressFile passes URLs through untouched and only inflates legacy
  // lzs:: payloads, so one call normalises both generations.
  const resolved = decompressFile(value);
  const fileName = name || 'attachment';

  const isUrl = resolved.startsWith('http://') || resolved.startsWith('https://');
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const looksLikeImage =
    resolved.startsWith('data:image/') ||
    (isUrl && ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext));
  const looksLikePdf =
    resolved.startsWith('data:application/pdf') || (isUrl && ext === 'pdf');

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
        <img
          src={resolved}
          alt={fileName}
          loading="lazy"
          width={800}
          height={600}
          className="w-full aspect-video max-h-72 object-contain rounded-lg hover:scale-[1.02] transition-transform duration-300 border border-line/60 cursor-pointer mx-auto"
          onClick={triggerDownload}
        />
      ) : looksLikePdf ? (
        <div className="space-y-2">
          <iframe
            src={resolved}
            title={fileName}
            className="w-full h-64 rounded-lg border border-line bg-paper-2"
          />
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
