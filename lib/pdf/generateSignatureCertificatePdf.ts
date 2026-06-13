import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatPacificDateTime } from "@/lib/dates";
import {
  signatureCertificationStatement,
  signatureConfirmationCheckboxLanguage,
  type SignatureLocationAudit
} from "@/lib/signatureAudit";
import type { ApplicationData } from "@/lib/types";
import { fullName } from "@/lib/types";

export type SignatureCertificateInput = {
  submissionId: string;
  submittedAt: Date;
  application: ApplicationData;
  certifiedDocuments: string[];
  ipAddress: string;
  userAgent: string;
  location: SignatureLocationAudit;
};

const pageWidth = 612;
const pageHeight = 792;
const margin = 54;
const bodySize = 10.5;
const headingSize = 13;
const titleSize = 22;
const lineHeight = 15;

export async function generateSignatureCertificatePdf(input: SignatureCertificateInput) {
  const pdfDoc = await PDFDocument.create();
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const drawText = (text: string, options: { font?: PDFFont; size?: number; indent?: number } = {}) => {
    const font = options.font || regularFont;
    const size = options.size || bodySize;
    const indent = options.indent || 0;
    const maxWidth = pageWidth - margin * 2 - indent;
    const lines = wrapText(text, font, size, maxWidth);
    for (const line of lines) {
      if (y < margin + lineHeight) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
      page.drawText(line, {
        x: margin + indent,
        y,
        size,
        font,
        color: rgb(0.08, 0.1, 0.12)
      });
      y -= lineHeight;
    }
  };

  const drawSection = (title: string) => {
    y -= 8;
    if (y < margin + 44) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
    page.drawLine({
      start: { x: margin, y: y + 7 },
      end: { x: pageWidth - margin, y: y + 7 },
      thickness: 0.8,
      color: rgb(0.72, 0.76, 0.74)
    });
    drawText(title, { font: boldFont, size: headingSize });
    y -= 2;
  };

  page.drawText("Certificate of Signature", {
    x: margin,
    y,
    size: titleSize,
    font: boldFont,
    color: rgb(0.02, 0.35, 0.25)
  });
  y -= 28;
  drawText(
    "This certificate records the signature and submission information collected by CAMO Help. CAMO may require additional verification or official signing if needed."
  );

  drawSection("Submission Info");
  drawLabelValue(page, boldFont, regularFont, "Reference ID:", input.submissionId, y);
  y -= lineHeight;
  drawLabelValue(page, boldFont, regularFont, "Date/time submitted:", formatPacificDateTime(input.submittedAt), y);
  y -= lineHeight;
  drawLabelValue(page, boldFont, regularFont, "UTC timestamp:", input.submittedAt.toISOString(), y);
  y -= lineHeight;

  drawSection("Certified Documents");
  input.certifiedDocuments.forEach((documentName) => drawText(`- ${documentName}`));

  drawSection("Signer Info");
  drawLabelValue(page, boldFont, regularFont, "Typed legal name:", input.application.signatureName || fullName(input.application), y);
  y -= lineHeight;
  drawLabelValue(page, boldFont, regularFont, "Email used:", input.application.email || "Not provided", y);
  y -= lineHeight;
  drawLabelValue(page, boldFont, regularFont, "Phone number:", input.application.phone || "Not provided", y);
  y -= lineHeight;
  drawLabelValue(page, boldFont, regularFont, "Date of birth:", input.application.birthDate || "Not provided", y);
  y -= lineHeight;

  drawSection("Audit Info");
  drawLabelValue(page, boldFont, regularFont, "IP address:", input.ipAddress || "Unavailable", y);
  y -= lineHeight;
  drawText("Device/browser information:", { font: boldFont });
  drawText(input.userAgent || "Unavailable", { indent: 14 });
  drawText(`Location status: ${formatLocation(input.location)}`);

  drawSection("Confirmation");
  drawText("Confirmation checkbox language accepted during submission:", { font: boldFont });
  signatureConfirmationCheckboxLanguage.forEach((line) => drawText(`- ${line}`));
  y -= 3;
  drawText("Certification statement:", { font: boldFont });
  drawText(signatureCertificationStatement);

  return pdfDoc.save();
}

function drawLabelValue(page: PDFPage, boldFont: PDFFont, regularFont: PDFFont, label: string, value: string, y: number) {
  page.drawText(label, {
    x: margin,
    y,
    size: bodySize,
    font: boldFont,
    color: rgb(0.08, 0.1, 0.12)
  });
  page.drawText(value, {
    x: margin + 128,
    y,
    size: bodySize,
    font: regularFont,
    color: rgb(0.08, 0.1, 0.12)
  });
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }

  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function formatLocation(location: SignatureLocationAudit) {
  if (location.status === "granted") {
    return `Location granted. Latitude: ${location.latitude.toFixed(6)}. Longitude: ${location.longitude.toFixed(
      6
    )}. Accuracy: ${Math.round(location.accuracy)} meters. Timestamp: ${location.timestamp}.`;
  }
  if (location.status === "denied") {
    return `Location permission denied${location.timestamp ? ` at ${location.timestamp}` : ""}.`;
  }
  return `Location unavailable${location.reason ? `: ${location.reason}` : ""}${location.timestamp ? ` at ${location.timestamp}` : ""}.`;
}
