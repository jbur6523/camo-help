import { PDFDocument } from "pdf-lib";
import { documentCheckPerFileLimitBytes, submissionPerFileLimitBytes } from "@/lib/files/documentPolicies";

export type DocumentValidationPurpose = "submission" | "document-check";

export type DocumentKind = "jpeg" | "png" | "pdf" | "heic" | "heif" | "webp" | "gif";

export type DocumentValidationReasonCode =
  | "EMPTY_FILE"
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_TYPE"
  | "MIME_MISMATCH"
  | "EXTENSION_MISMATCH"
  | "INVALID_SIGNATURE"
  | "MALFORMED_FILE"
  | "ENCRYPTED_PDF"
  | "PDF_PAGE_LIMIT_EXCEEDED";

export const safeDocumentValidationMessage =
  "This file could not be processed safely. You may choose another file and try again.";

export class DocumentValidationError extends Error {
  readonly reasonCode: DocumentValidationReasonCode;

  constructor(reasonCode: DocumentValidationReasonCode) {
    super(safeDocumentValidationMessage);
    this.name = "DocumentValidationError";
    this.reasonCode = reasonCode;
  }
}

export type UploadedDocumentInput = {
  bytes: Uint8Array;
  declaredMimeType: string;
  filename: string;
};

export type ValidatedDocument = {
  bytes: Uint8Array;
  kind: DocumentKind;
  mimeType: string;
  byteSize: number;
  pageCount?: number;
};

type FormatDefinition = {
  kind: DocumentKind;
  mimeTypes: string[];
  extensions: string[];
};

const formats: FormatDefinition[] = [
  { kind: "jpeg", mimeTypes: ["image/jpeg", "image/jpg"], extensions: ["jpg", "jpeg"] },
  { kind: "png", mimeTypes: ["image/png"], extensions: ["png"] },
  { kind: "pdf", mimeTypes: ["application/pdf"], extensions: ["pdf"] },
  { kind: "heic", mimeTypes: ["image/heic"], extensions: ["heic"] },
  { kind: "heif", mimeTypes: ["image/heif"], extensions: ["heif"] },
  { kind: "webp", mimeTypes: ["image/webp"], extensions: ["webp"] },
  { kind: "gif", mimeTypes: ["image/gif"], extensions: ["gif"] }
];

const documentCheckKinds = new Set<DocumentKind>(["jpeg", "png", "pdf"]);
// Some image editors append a small metadata or padding block after JPEG EOI.
// Keep that compatibility bounded; every scan is also capped by the per-file policy.
const maxJpegTrailingBytes = 64 * 1024;
const maxJpegMarkerCount = 65_536;

export async function validateUploadedDocument(
  input: UploadedDocumentInput,
  purpose: DocumentValidationPurpose
): Promise<ValidatedDocument> {
  const bytes = input.bytes;
  if (!bytes.byteLength) throw new DocumentValidationError("EMPTY_FILE");

  const limit = purpose === "document-check" ? documentCheckPerFileLimitBytes : submissionPerFileLimitBytes;
  if (bytes.byteLength > limit) throw new DocumentValidationError("FILE_TOO_LARGE");

  const mimeType = input.declaredMimeType.trim().toLowerCase().split(";")[0];
  const extension = fileExtension(input.filename);
  const extensionFormat = formats.find((format) => format.extensions.includes(extension));
  const mimeFormat = mimeType === "application/octet-stream" || !mimeType
    ? extensionFormat
    : formats.find((format) => format.mimeTypes.includes(mimeType));

  if (!mimeFormat) throw new DocumentValidationError("UNSUPPORTED_TYPE");
  if (!extensionFormat) throw new DocumentValidationError("EXTENSION_MISMATCH");
  if (mimeFormat.kind !== extensionFormat.kind) throw new DocumentValidationError("MIME_MISMATCH");
  if (purpose === "document-check" && !documentCheckKinds.has(mimeFormat.kind)) {
    throw new DocumentValidationError("UNSUPPORTED_TYPE");
  }
  if (!signatureMatches(bytes, mimeFormat.kind)) throw new DocumentValidationError("INVALID_SIGNATURE");

  let pageCount: number | undefined;
  if (mimeFormat.kind === "pdf") {
    const result = await inspectPdf(bytes);
    pageCount = result.pageCount;
    if (purpose === "document-check" && result.encrypted) {
      throw new DocumentValidationError("ENCRYPTED_PDF");
    }
    if (purpose === "document-check" && pageCount > 2) {
      throw new DocumentValidationError("PDF_PAGE_LIMIT_EXCEEDED");
    }
  } else if (!hasReadableImageStructure(bytes, mimeFormat.kind)) {
    throw new DocumentValidationError("MALFORMED_FILE");
  }

  return {
    bytes,
    kind: mimeFormat.kind,
    mimeType: canonicalMimeType(mimeFormat.kind),
    byteSize: bytes.byteLength,
    ...(pageCount === undefined ? {} : { pageCount })
  };
}

async function inspectPdf(bytes: Uint8Array) {
  try {
    const declaresEncryption = includesAscii(bytes, "/Encrypt");
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    const pageCount = pdf.getPageCount();
    if (pageCount < 1) throw new DocumentValidationError("MALFORMED_FILE");
    return { pageCount, encrypted: pdf.isEncrypted || declaresEncryption };
  } catch (error) {
    if (error instanceof DocumentValidationError) throw error;
    throw new DocumentValidationError("MALFORMED_FILE");
  }
}

function fileExtension(filename: string) {
  const match = /\.([a-z0-9]+)$/i.exec(filename.trim());
  return match?.[1]?.toLowerCase() || "";
}

function canonicalMimeType(kind: DocumentKind) {
  if (kind === "jpeg") return "image/jpeg";
  if (kind === "pdf") return "application/pdf";
  return `image/${kind}`;
}

function signatureMatches(bytes: Uint8Array, kind: DocumentKind) {
  if (kind === "jpeg") return startsWith(bytes, [0xff, 0xd8, 0xff]);
  if (kind === "png") return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (kind === "pdf") {
    const headerOffset = indexOfAscii(bytes.slice(0, 1024), "%PDF-");
    return headerOffset >= 0;
  }
  if (kind === "gif") return ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a";
  if (kind === "webp") return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP";
  if (kind === "heic" || kind === "heif") {
    if (ascii(bytes, 4, 4) !== "ftyp") return false;
    const brand = ascii(bytes, 8, 4);
    return ["heic", "heix", "hevc", "hevx", "mif1", "msf1", "heif"].includes(brand);
  }
  return false;
}

function hasReadableImageStructure(bytes: Uint8Array, kind: Exclude<DocumentKind, "pdf">) {
  if (kind === "jpeg") {
    return hasReadableJpegStructure(bytes);
  }
  if (kind === "png") {
    return bytes.byteLength >= 45 && ascii(bytes, 12, 4) === "IHDR" && includesAscii(bytes, "IEND");
  }
  if (kind === "gif") return bytes.byteLength >= 14;
  if (kind === "webp") return bytes.byteLength >= 16;
  return bytes.byteLength >= 16;
}

function hasReadableJpegStructure(bytes: Uint8Array) {
  if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;

  let offset = 2;
  let markerCount = 0;
  let sawFrame = false;
  let sawScan = false;

  while (offset < bytes.byteLength) {
    if (bytes[offset] !== 0xff) return false;

    while (offset < bytes.byteLength && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.byteLength) return false;

    const marker = bytes[offset];
    offset += 1;
    markerCount += 1;
    if (markerCount > maxJpegMarkerCount || marker === 0x00 || marker === 0xd8) return false;

    if (marker === 0xd9) {
      return sawFrame && sawScan && bytes.byteLength - offset <= maxJpegTrailingBytes;
    }

    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.byteLength) return false;

    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2) return false;
    const segmentEnd = offset + segmentLength;
    if (segmentEnd > bytes.byteLength) return false;

    if (isJpegFrameMarker(marker)) {
      const componentCount = bytes[offset + 7];
      if (!componentCount || segmentLength !== 8 + 3 * componentCount) return false;
      sawFrame = true;
    }

    if (marker !== 0xda) {
      offset = segmentEnd;
      continue;
    }

    const scanComponentCount = bytes[offset + 2];
    if (!sawFrame || !scanComponentCount || segmentLength !== 6 + 2 * scanComponentCount) return false;
    sawScan = true;
    offset = segmentEnd;

    // Scan entropy-coded data without decoding pixels. FF 00 is escaped data,
    // restart markers remain inside the scan, and any other marker returns to
    // the bounded marker parser above.
    while (offset < bytes.byteLength) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }

      const markerStart = offset;
      while (offset < bytes.byteLength && bytes[offset] === 0xff) offset += 1;
      if (offset >= bytes.byteLength) return false;

      const scanMarker = bytes[offset];
      if (scanMarker === 0x00 || (scanMarker >= 0xd0 && scanMarker <= 0xd7)) {
        offset += 1;
        continue;
      }

      offset = markerStart;
      break;
    }
  }

  return false;
}

function isJpegFrameMarker(marker: number) {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function includesAscii(bytes: Uint8Array, value: string) {
  return indexOfAscii(bytes, value) >= 0;
}

function indexOfAscii(bytes: Uint8Array, value: string) {
  const target = Array.from(value).map((character) => character.charCodeAt(0));
  for (let index = 0; index <= bytes.length - target.length; index += 1) {
    if (target.every((byte, targetIndex) => bytes[index + targetIndex] === byte)) return index;
  }
  return -1;
}
