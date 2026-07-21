import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "@/app/api/submit-application/route";
import { buildSubmissionEmailMessages, type EmailAttachment } from "@/lib/email/sendApplicationEmails";
import { buildSupportFighterSubmissionNotificationText } from "@/lib/email/supportNotifications";
import { assertMappedPdfFieldsPresent } from "@/lib/pdf/validatePdfFieldMap";
import { filterSelectedUploads } from "@/lib/submission/filterSelectedUploads";
import { maxSingleOutgoingFileBytes, submissionSizeProblem } from "@/lib/submission/outgoingFileValidation";
import { assertRequiredUploadsPresent, MissingRequiredUploadsError } from "@/lib/submission/validateRequiredUploads";
import { defaultApplicationData, type ApplicationData, type RequirementKey, type UploadKey } from "@/lib/types";

function application(requirementsNeeded: RequirementKey[]): ApplicationData {
  return {
    ...defaultApplicationData,
    firstName: "Synthetic",
    lastName: "Applicant",
    email: "synthetic@example.invalid",
    birthDate: "01/01/2000",
    requirementsNeeded
  };
}

function attachment(filename: string, size = 16): EmailAttachment {
  return {
    filename,
    content: Buffer.alloc(size, 1),
    contentType: "application/octet-stream"
  };
}

function attachmentNames(messages: ReturnType<typeof buildSubmissionEmailMessages>, kind: "application" | "medical") {
  return messages.find((message) => message.kind === kind)?.attachments.map((item) => item.filename) || [];
}

test("full application sends the selected application, identity, and medical attachments", () => {
  const payload = {
    submissionId: "synthetic-full",
    application: application([
      "athleteLicenseApplication",
      "nationalMmaIdApplication",
      "bloodwork",
      "physical",
      "headshot",
      "photoId"
    ]),
    athletePdf: attachment("athlete.pdf"),
    nationalIdPdf: attachment("national.pdf"),
    signatureCertificatePdf: attachment("signature.pdf"),
    uploads: {
      bloodwork: [attachment("bloodwork.pdf")],
      physical: [attachment("physical.pdf")],
      headshot: [attachment("headshot.jpg")],
      photoId: [attachment("photo-id.jpg")],
      cardio: [attachment("cardio.pdf")],
      additional: [attachment("additional.pdf")]
    }
  };

  assertRequiredUploadsPresent(payload.application, payload.uploads);
  const messages = buildSubmissionEmailMessages(payload, {
    applicationRecipient: "application@example.invalid",
    medicalRecipient: "medical@example.invalid",
    betaMode: true
  });

  assert.deepEqual(attachmentNames(messages, "application"), [
    "athlete.pdf",
    "national.pdf",
    "signature.pdf",
    "headshot.jpg",
    "photo-id.jpg"
  ]);
  assert.deepEqual(attachmentNames(messages, "medical"), [
    "bloodwork.pdf",
    "physical.pdf",
    "cardio.pdf",
    "additional.pdf"
  ]);
});

test("documents-only submission succeeds without generated application PDFs", () => {
  const payload = {
    submissionId: "synthetic-documents-only",
    application: application(["bloodwork"]),
    uploads: {
      bloodwork: [attachment("bloodwork.pdf")],
      cardio: [attachment("cardio.pdf")],
      additional: [attachment("additional.pdf")]
    }
  };

  assertRequiredUploadsPresent(payload.application, payload.uploads);
  const messages = buildSubmissionEmailMessages(payload, {
    applicationRecipient: "application@example.invalid",
    medicalRecipient: "medical@example.invalid",
    betaMode: true
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.kind, "medical");
  assert.deepEqual(attachmentNames(messages, "medical"), ["bloodwork.pdf", "cardio.pdf", "additional.pdf"]);
});

test("previously selected but subsequently deselected uploads are filtered out", () => {
  const uploads: Partial<Record<UploadKey, EmailAttachment[]>> = {
    bloodwork: [attachment("selected-bloodwork.pdf")],
    physical: [attachment("deselected-physical.pdf")],
    headshot: [attachment("deselected-headshot.jpg")],
    photoId: [attachment("deselected-photo-id.jpg")]
  };
  const selected = filterSelectedUploads(["bloodwork"], uploads);

  assert.deepEqual(Object.keys(selected), ["bloodwork"]);
  const messages = buildSubmissionEmailMessages(
    { application: application(["bloodwork"]), uploads },
    {
      applicationRecipient: "application@example.invalid",
      medicalRecipient: "medical@example.invalid",
      betaMode: true
    }
  );
  assert.deepEqual(attachmentNames(messages, "medical"), ["selected-bloodwork.pdf"]);
  assert.deepEqual(attachmentNames(messages, "application"), []);
});

test("multiple individually valid compressed images may exceed 4 MB in aggregate", () => {
  const compressedImages = Array.from({ length: 5 }, () => ({ size: 1024 * 1024 }));
  assert.equal(submissionSizeProblem(compressedImages), "");
  assert.notEqual(submissionSizeProblem([{ size: maxSingleOutgoingFileBytes + 1 }]), "");
});

test("support notification describes only selected requirement-driven uploads", () => {
  const text = buildSupportFighterSubmissionNotificationText({
    application: application(["bloodwork"]),
    uploads: {
      bloodwork: [attachment("selected-bloodwork.pdf")],
      physical: [attachment("deselected-physical.pdf")],
      headshot: [attachment("deselected-headshot.jpg")]
    },
    submittedAt: new Date("2026-07-21T12:00:00Z"),
    submissionId: "synthetic-support",
    athletePdfGenerated: false,
    nationalIdPdfGenerated: false,
    applicationEmailSent: false,
    medicalEmailSent: true,
    fighterConfirmationEmailSent: true,
    promoterNotificationStatus: "not_applicable"
  });

  assert.match(text, /- Blood Work/);
  assert.doesNotMatch(text, /- Physical Exam/);
  assert.doesNotMatch(text, /- Headshot Photo/);
});

test("required attachment validation reports absent selected groups", () => {
  assert.throws(
    () => assertRequiredUploadsPresent(application(["bloodwork", "physical"]), { bloodwork: [attachment("bloodwork.pdf")] }),
    (error: unknown) => error instanceof MissingRequiredUploadsError && error.missingGroups.length === 1
  );
});

test("PDF mapping validation fails when an expected field is missing", () => {
  assert.throws(
    () =>
      assertMappedPdfFieldsPresent(
        "Synthetic PDF",
        {
          text: { expected_text: "value" },
          checkboxes: { expected_checkbox: true },
          signatureFields: ["expected_signature"]
        },
        ["expected_text", "expected_signature"]
      ),
    /Missing mapped fields for Synthetic PDF: expected_checkbox/
  );
});

test("submission failures return and log safe metadata without exposing file data", async () => {
  const secretFilename = "private-medical-file.pdf";
  const secretFileContents = "synthetic-base64-like-file-content";
  const secretName = "Sensitive Synthetic Name";
  const secretEmail = "sensitive@example.invalid";
  const formData = new FormData();
  formData.append("submissionId", `synthetic-safe-error-${Date.now()}`);
  formData.append(
    "application",
    JSON.stringify({
      ...application(["bloodwork"]),
      firstName: secretName,
      lastName: "",
      email: secretEmail
    })
  );
  formData.append("additional", new File([secretFileContents], secretFilename, { type: "application/pdf" }));

  const originalSupportEmail = process.env.SUPPORT_EMAIL_TO;
  const originalConsole = { info: console.info, warn: console.warn, error: console.error };
  const logs: unknown[][] = [];
  process.env.SUPPORT_EMAIL_TO = "";
  console.info = (...args: unknown[]) => void logs.push(args);
  console.warn = (...args: unknown[]) => void logs.push(args);
  console.error = (...args: unknown[]) => void logs.push(args);

  try {
    const response = await POST(new Request("http://localhost/api/submit-application", { method: "POST", body: formData }));
    const responseText = await response.text();
    const loggedText = JSON.stringify(logs);

    assert.equal(response.status, 400);
    assert.match(responseText, /This file could not be processed safely/);
    assert.doesNotMatch(loggedText, /Blood Work|medical-file|base64-like/);
    for (const sensitiveValue of [secretFilename, secretFileContents, secretName, secretEmail]) {
      assert.doesNotMatch(responseText, new RegExp(sensitiveValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.doesNotMatch(loggedText, new RegExp(sensitiveValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  } finally {
    console.info = originalConsole.info;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    if (originalSupportEmail === undefined) delete process.env.SUPPORT_EMAIL_TO;
    else process.env.SUPPORT_EMAIL_TO = originalSupportEmail;
  }
});
