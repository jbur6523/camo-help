import { NextResponse } from "next/server";
import { NoSelectedEmailAttachmentsError, sendApplicationEmails } from "@/lib/email/sendApplicationEmails";
import { assertRequiredUploadsPresent, MissingRequiredUploadsError } from "@/lib/submission/validateRequiredUploads";
import type { ApplicationData, UploadKey } from "@/lib/types";

export const runtime = "nodejs";

const uploadKeys: UploadKey[] = ["bloodwork", "physical", "headshot", "photoId", "cardio", "additional"];

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const applicationJson = formData.get("application");
    if (typeof applicationJson !== "string") {
      return NextResponse.json({ error: "Application payload is missing." }, { status: 400 });
    }

    const application = JSON.parse(applicationJson) as ApplicationData;
    const athletePdf = await attachmentFromForm(formData, "athletePdf", "completed-athlete-license.pdf");
    const nationalIdPdf = await attachmentFromForm(formData, "nationalIdPdf", "completed-national-mma-id.pdf");
    const requirementsNeeded = application.requirementsNeeded || [];

    if (requirementsNeeded.includes("athleteLicenseApplication") && !athletePdf) {
      return NextResponse.json({ error: "Completed Athlete License PDF is missing." }, { status: 400 });
    }

    if (requirementsNeeded.includes("nationalMmaIdApplication") && !nationalIdPdf) {
      return NextResponse.json({ error: "Completed National MMA ID PDF is missing." }, { status: 400 });
    }

    const uploads: Record<string, Awaited<ReturnType<typeof attachmentsFromForm>>> = {};
    for (const key of uploadKeys) {
      uploads[key] = await attachmentsFromForm(formData, key);
    }

    assertRequiredUploadsPresent(application, uploads);

    const result = await sendApplicationEmails({
      application,
      athletePdf,
      nationalIdPdf,
      uploads
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Submission failed.";
    return NextResponse.json(
      { error: message },
      { status: error instanceof NoSelectedEmailAttachmentsError || error instanceof MissingRequiredUploadsError ? 400 : 500 }
    );
  }
}

async function attachmentFromForm(formData: FormData, key: string, fallbackName?: string) {
  const file = formData.get(key);
  if (!(file instanceof File) || file.size === 0) return undefined;
  return {
    filename: file.name || fallbackName || key,
    content: Buffer.from(await file.arrayBuffer()),
    contentType: file.type || "application/octet-stream"
  };
}

async function attachmentsFromForm(formData: FormData, key: string) {
  const files = formData.getAll(key).filter((file): file is File => file instanceof File && file.size > 0);
  return Promise.all(
    files.map(async (file) => ({
      filename: file.name || key,
      content: Buffer.from(await file.arrayBuffer()),
      contentType: file.type || "application/octet-stream"
    }))
  );
}
