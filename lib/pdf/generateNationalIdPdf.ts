import type { ApplicationData } from "@/lib/types";
import { fillAcroForm } from "@/lib/pdf/fillAcroForm";
import { nationalIdFieldPlan } from "@/lib/pdf/pdfFieldNameMap";
import { PDFDocument } from "pdf-lib";

export async function generateNationalIdPdf(templateBytes: ArrayBuffer, data: ApplicationData) {
  const pdfDoc = await PDFDocument.load(templateBytes);
  await fillAcroForm(pdfDoc, nationalIdFieldPlan(data), {
    signatureDataUrl: getSignatureDataUrl(data),
    warn: warnInDevelopment
  });
  return pdfDoc.save();
}

function getSignatureDataUrl(data: ApplicationData) {
  return (data as unknown as { signatureDataUrl?: string; drawnSignatureDataUrl?: string }).signatureDataUrl ||
    (data as unknown as { signatureDataUrl?: string; drawnSignatureDataUrl?: string }).drawnSignatureDataUrl;
}

function warnInDevelopment(message: string) {
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[National ID PDF] ${message}`);
  }
}
