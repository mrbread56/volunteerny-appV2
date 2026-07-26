import LZString from 'lz-string';

/**
 * Standard prefix to identify compressed payloads in the database.
 * If a payload has this prefix, we know it is compressed and needs decompression.
 */
const COMPRESSED_PREFIX = 'lzs::';

/**
 * Compresses a string (like a base64 files/resumes) to save database space.
 */
export function compressFile(original: string | null | undefined): string {
  if (!original) return '';
  if (original.startsWith(COMPRESSED_PREFIX)) return original; // Already compressed
  
  try {
    const compressed = LZString.compressToEncodedURIComponent(original);
    // Only use compressed version if it actually saved space
    if (compressed.length < original.length) {
      return COMPRESSED_PREFIX + compressed;
    }
  } catch (err) {
    console.error('Failed to compress data', err);
  }
  return original;
}

/**
 * Decompresses a string if it was compressed using compressFile.
 */
export function decompressFile(data: string | null | undefined): string {
  if (!data) return '';
  if (!data.startsWith(COMPRESSED_PREFIX)) return data; // Raw/uncompressed string
  
  try {
    const compressedStr = data.substring(COMPRESSED_PREFIX.length);
    const decompressed = LZString.decompressFromEncodedURIComponent(compressedStr);
    return decompressed || data;
  } catch (err) {
    console.error('Failed to decompress data', err);
    return data;
  }
}

/**
 * Helper to get the byte size of a base64/standard string.
 */
export function getStringSizeKB(str: string): number {
  if (!str) return 0;
  return Math.round((str.length * 2) / 1024);
}
