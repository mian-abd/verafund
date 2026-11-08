// Which image type the bytes really are. The browser-declared type can be missing or wrong, and
// Claude rejects an image whose declared media type does not match its data.

export type SniffedImageType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function ascii(bytes: Uint8Array, start: number, text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (bytes[start + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

export function sniffImageMediaType(bytes: Uint8Array): SniffedImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= PNG.length && PNG.every((b, i) => bytes[i] === b)) return "image/png";
  if (bytes.length >= 6 && ascii(bytes, 0, "GIF8")) return "image/gif";
  if (bytes.length >= 12 && ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WEBP")) return "image/webp";
  return null;
}
