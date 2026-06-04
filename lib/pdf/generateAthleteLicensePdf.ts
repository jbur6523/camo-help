import type { ApplicationData } from "@/lib/types";
import { fillAcroForm } from "@/lib/pdf/fillAcroForm";
import { generateContinuationSheets } from "@/lib/pdf/generateContinuationSheets";
import { athleteLicenseFieldPlan, athleteOverflowPlan } from "@/lib/pdf/pdfFieldNameMap";
import { PDFDocument } from "pdf-lib";

export async function generateAthleteLicensePdf(templateBytes: ArrayBuffer, data: ApplicationData) {
  const pdfDoc = await PDFDocument.load(templateBytes);
  const overflow = athleteOverflowPlan(data);

  await fillAcroForm(pdfDoc, athleteLicenseFieldPlan(data, overflow), {
    signatureDataUrl: getSignatureDataUrl(data),
    warn: warnInDevelopment
  });

  const continuationBytes = await generateContinuationSheets(data, overflow);
  if (continuationBytes) {
    const continuationPdf = await PDFDocument.load(continuationBytes);
    const pages = await pdfDoc.copyPages(continuationPdf, continuationPdf.getPageIndices());
    pages.forEach((page) => pdfDoc.addPage(page));
  }

  return pdfDoc.save();
}

function getSignatureDataUrl(data: ApplicationData) {
  return (data as unknown as { signatureDataUrl?: string; drawnSignatureDataUrl?: string }).signatureDataUrl ||
    (data as unknown as { signatureDataUrl?: string; drawnSignatureDataUrl?: string }).drawnSignatureDataUrl;
}

function warnInDevelopment(message: string) {
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[Athlete License PDF] ${message}`);
  }
}
