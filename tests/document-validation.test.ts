import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, PDFName } from "pdf-lib";
import { maxSingleOutgoingFileBytes } from "@/lib/submission/outgoingFileValidation";
import { documentCheckPerFileLimitBytes, submissionPerFileLimitBytes } from "@/lib/files/documentPolicies";
import {
  DocumentValidationError,
  type DocumentValidationReasonCode,
  validateUploadedDocument
} from "@/lib/files/serverDocumentValidation";
import {
  assertDocumentCheckRequestHeaders,
  documentCheckMaxRequestBytes,
  DocumentCheckRequestPolicyError
} from "@/lib/document-check/requestPolicy";

const jpeg = (trailingBytes: number[] = []) => Uint8Array.from([
  0xff, 0xd8,
  0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
  0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
  0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
  0x00,
  0xff, 0xd9,
  ...trailingBytes
]);

function jpegWithByteSize(byteSize: number) {
  const base = jpeg();
  if (byteSize < base.byteLength) throw new Error("Synthetic JPEG size is too small.");
  const bytes = new Uint8Array(byteSize);
  bytes.set(base.slice(0, -2), 0);
  bytes[byteSize - 2] = 0xff;
  bytes[byteSize - 1] = 0xd9;
  return bytes;
}
const png = () => {
  const bytes = new Uint8Array(45);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set(Array.from("IHDR", (value) => value.charCodeAt(0)), 12);
  bytes.set(Array.from("IEND", (value) => value.charCodeAt(0)), 37);
  return bytes;
};

async function pdf(pageCount: number, encryptionMarker = false) {
  const document = await PDFDocument.create();
  for (let page = 0; page < pageCount; page += 1) document.addPage([200, 200]);
  if (encryptionMarker) {
    document.context.trailerInfo.Encrypt = document.context.register(
      document.context.obj({ Filter: PDFName.of("Standard"), V: 1 })
    );
  }
  return document.save({ useObjectStreams: false });
}

async function expectReason(
  promise: Promise<unknown>,
  reasonCode: DocumentValidationReasonCode
) {
  await assert.rejects(
    promise,
    (error: unknown) => error instanceof DocumentValidationError && error.reasonCode === reasonCode
  );
}

test("standard JPEG ending directly in FF D9 and PNG qualify for future document checks", async () => {
  assert.equal((await validateUploadedDocument({ bytes: jpeg(), declaredMimeType: "image/jpeg", filename: "synthetic.jpg" }, "document-check")).kind, "jpeg");
  assert.equal((await validateUploadedDocument({ bytes: png(), declaredMimeType: "image/png", filename: "synthetic.png" }, "document-check")).kind, "png");
});

test("JPEG with bounded trailing metadata is accepted by AI and normal submission validation", async () => {
  const bytes = jpeg([0x00, 0x00, 0x49, 0x4e, 0x53, 0x54, 0x41]);
  assert.equal(
    (await validateUploadedDocument(
      { bytes, declaredMimeType: "image/jpeg", filename: "synthetic.jpg" },
      "document-check"
    )).kind,
    "jpeg"
  );
  assert.equal(
    (await validateUploadedDocument(
      { bytes, declaredMimeType: "image/jpeg", filename: "synthetic.jpg" },
      "submission"
    )).kind,
    "jpeg"
  );
});

test("JPEG trailing data beyond the bounded allowance is rejected", async () => {
  await expectReason(
    validateUploadedDocument(
      {
        bytes: jpeg(new Array(64 * 1024 + 1).fill(0x00)),
        declaredMimeType: "image/jpeg",
        filename: "synthetic.jpg"
      },
      "document-check"
    ),
    "MALFORMED_FILE"
  );
});

test("truncated JPEG without an end marker is rejected as malformed", async () => {
  await expectReason(
    validateUploadedDocument(
      { bytes: jpeg().slice(0, -2), declaredMimeType: "image/jpeg", filename: "synthetic.jpg" },
      "document-check"
    ),
    "MALFORMED_FILE"
  );
});

test("one-page and two-page PDFs qualify for future document checks", async () => {
  assert.equal((await validateUploadedDocument({ bytes: await pdf(1), declaredMimeType: "application/pdf", filename: "synthetic.pdf" }, "document-check")).pageCount, 1);
  assert.equal((await validateUploadedDocument({ bytes: await pdf(2), declaredMimeType: "application/pdf", filename: "synthetic.pdf" }, "document-check")).pageCount, 2);
});

test("three-page PDFs remain valid submissions but are rejected for AI-check eligibility", async () => {
  const bytes = await pdf(3);
  assert.equal((await validateUploadedDocument({ bytes, declaredMimeType: "application/pdf", filename: "synthetic.pdf" }, "submission")).pageCount, 3);
  await expectReason(
    validateUploadedDocument({ bytes, declaredMimeType: "application/pdf", filename: "synthetic.pdf" }, "document-check"),
    "PDF_PAGE_LIMIT_EXCEEDED"
  );
});

test("encrypted or password-protected PDF markers are rejected for AI checks", async () => {
  await expectReason(
    validateUploadedDocument({ bytes: await pdf(1, true), declaredMimeType: "application/pdf", filename: "synthetic.pdf" }, "document-check"),
    "ENCRYPTED_PDF"
  );
});

test("corrupted PDFs, malformed images, and empty images fail safely", async () => {
  await expectReason(
    validateUploadedDocument({ bytes: new TextEncoder().encode("%PDF-corrupted"), declaredMimeType: "application/pdf", filename: "synthetic.pdf" }, "document-check"),
    "MALFORMED_FILE"
  );
  await expectReason(
    validateUploadedDocument({ bytes: png().slice(0, 20), declaredMimeType: "image/png", filename: "synthetic.png" }, "document-check"),
    "MALFORMED_FILE"
  );
  await expectReason(
    validateUploadedDocument({ bytes: new Uint8Array(), declaredMimeType: "image/jpeg", filename: "synthetic.jpg" }, "document-check"),
    "EMPTY_FILE"
  );
});

test("MIME, extension, and magic-byte mismatches are rejected", async () => {
  await expectReason(
    validateUploadedDocument({ bytes: jpeg(), declaredMimeType: "image/jpeg", filename: "synthetic.png" }, "document-check"),
    "MIME_MISMATCH"
  );
  await expectReason(
    validateUploadedDocument({ bytes: jpeg(), declaredMimeType: "image/jpeg", filename: "synthetic" }, "document-check"),
    "EXTENSION_MISMATCH"
  );
  await expectReason(
    validateUploadedDocument({ bytes: Uint8Array.from([0, 1, 2, 3]), declaredMimeType: "image/jpeg", filename: "synthetic.jpg" }, "document-check"),
    "INVALID_SIGNATURE"
  );
  await expectReason(
    validateUploadedDocument({ bytes: png(), declaredMimeType: "image/jpeg", filename: "synthetic.jpg" }, "document-check"),
    "INVALID_SIGNATURE"
  );
  await expectReason(
    validateUploadedDocument({ bytes: jpeg(), declaredMimeType: "image/png", filename: "synthetic.jpg" }, "document-check"),
    "MIME_MISMATCH"
  );
});

test("future AI requests use a conservative 3 MB limit while submission remains 4 MB per file", async () => {
  const belowAiLimit = jpegWithByteSize(documentCheckPerFileLimitBytes);
  assert.equal((await validateUploadedDocument({ bytes: belowAiLimit, declaredMimeType: "image/jpeg", filename: "synthetic.jpg" }, "document-check")).byteSize, documentCheckPerFileLimitBytes);

  const aboveAiLimit = jpegWithByteSize(documentCheckPerFileLimitBytes + 1);
  await expectReason(
    validateUploadedDocument({ bytes: aboveAiLimit, declaredMimeType: "image/jpeg", filename: "synthetic.jpg" }, "document-check"),
    "FILE_TOO_LARGE"
  );
  assert.equal(submissionPerFileLimitBytes, 4 * 1024 * 1024);
  assert.equal(maxSingleOutgoingFileBytes, submissionPerFileLimitBytes);
  assert.doesNotReject(validateUploadedDocument({ bytes: aboveAiLimit, declaredMimeType: "image/jpeg", filename: "synthetic.jpg" }, "submission"));
  const aboveSubmissionLimit = jpegWithByteSize(submissionPerFileLimitBytes + 1);
  await expectReason(
    validateUploadedDocument({ bytes: aboveSubmissionLimit, declaredMimeType: "image/jpeg", filename: "synthetic.jpg" }, "submission"),
    "FILE_TOO_LARGE"
  );
});

test("future request headers reserve multipart overhead below the platform limit", () => {
  const accepted = new Headers({
    "content-type": "multipart/form-data; boundary=synthetic",
    "content-length": String(documentCheckMaxRequestBytes)
  });
  assert.doesNotThrow(() => assertDocumentCheckRequestHeaders(accepted));
  const rejected = new Headers({
    "content-type": "multipart/form-data; boundary=synthetic",
    "content-length": String(documentCheckMaxRequestBytes + 1)
  });
  assert.throws(
    () => assertDocumentCheckRequestHeaders(rejected),
    (error: unknown) => error instanceof DocumentCheckRequestPolicyError && error.reasonCode === "REQUEST_TOO_LARGE"
  );
});

test("normal submission retains HEIC, HEIF, WebP, and GIF signature support", async () => {
  const cases = [
    { bytes: bmff("heic"), type: "image/heic", filename: "synthetic.heic", kind: "heic" },
    { bytes: bmff("mif1"), type: "image/heif", filename: "synthetic.heif", kind: "heif" },
    { bytes: asciiBytes("RIFF0000WEBP0000"), type: "image/webp", filename: "synthetic.webp", kind: "webp" },
    { bytes: asciiBytes("GIF89a00000000"), type: "image/gif", filename: "synthetic.gif", kind: "gif" }
  ] as const;
  for (const item of cases) {
    assert.equal((await validateUploadedDocument({ bytes: item.bytes, declaredMimeType: item.type, filename: item.filename }, "submission")).kind, item.kind);
  }
});

function asciiBytes(value: string) {
  return Uint8Array.from(Array.from(value, (character) => character.charCodeAt(0)));
}

function bmff(brand: string) {
  return asciiBytes(`0000ftyp${brand}0000`);
}
