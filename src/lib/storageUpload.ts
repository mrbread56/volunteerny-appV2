import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase/config';

/**
 * Resize an image file on a canvas before upload, matching the existing
 * compression behaviour so Storage files are no larger than the old
 * base64-in-Firestore ones.
 *
 * Returns a Blob ready for upload.
 */
function resizeImage(
  file: File,
  maxWidth = 1000,
  quality = 0.5,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);

      let width = img.width;
      let height = img.height;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas toBlob produced null'));
        },
        'image/jpeg',
        quality,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image failed to load for resize'));
    };
    img.src = url;
  });
}

export interface UploadProgress {
  /** 0–100 */
  percent: number;
  /** Bytes transferred so far */
  bytesTransferred: number;
  /** Total bytes */
  totalBytes: number;
}

/**
 * Upload a file to Firebase Storage and return its public download URL.
 *
 * Images are resized client-side to keep Storage costs comparable to the old
 * base64-in-Firestore model.  Non-image files are uploaded as-is (no
 * LZ-String compression — Storage handles binary natively).
 *
 * @param file      The raw File from a file input or drop event.
 * @param path      The Storage path, e.g. `students/{uid}/resume.pdf`.
 * @param onProgress  Optional callback for upload progress.
 * @returns         The public download URL for the uploaded file.
 */
export async function uploadFileToStorage(
  file: File,
  path: string,
  onProgress?: (progress: UploadProgress) => void,
): Promise<string> {
  let blob: Blob = file;

  // Resize images client-side (same behaviour the old FileUpload had)
  if (file.type.startsWith('image/')) {
    blob = await resizeImage(file);
  }

  const storageRef = ref(storage, path);
  const task = uploadBytesResumable(storageRef, blob, {
    contentType: file.type || 'application/octet-stream',
  });

  return new Promise<string>((resolve, reject) => {
    // An upload that cannot succeed must not spin forever.
    //
    // Firebase Storage retries transport failures internally with a long
    // backoff, so when the bucket does not exist — which is the state this
    // project shipped in, because Storage was never enabled — the SDK neither
    // resolves nor rejects for a very long time. Every caller shows a spinner
    // while it waits, and the user sees a form that hangs with no error: the
    // safety-report dialog sat on "loading" forever for exactly this reason.
    // A bounded wait turns a hang into a sentence somebody can act on.
    const TIMEOUT_MS = 30_000;
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      task.cancel();
      reject(
        new Error(
          'The upload did not complete. File storage may not be set up for this site — ' +
            'you can submit without an attachment, and please report this.',
        ),
      );
    }, TIMEOUT_MS);

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    task.on(
      'state_changed',
      (snapshot) => {
        onProgress?.({
          percent: Math.round(
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100,
          ),
          bytesTransferred: snapshot.bytesTransferred,
          totalBytes: snapshot.totalBytes,
        });
      },
      (error) => finish(() => reject(error)),
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          finish(() => resolve(url));
        } catch (err) {
          finish(() => reject(err));
        }
      },
    );
  });
}

/**
 * Returns `true` when the value is a Firebase Storage (or any HTTPS) URL
 * rather than a legacy base64 data URI or LZ-compressed string.
 */
export function isStorageUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  return value.startsWith('https://') || value.startsWith('http://');
}
