import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { formatPacificDateTime, formatPacificLongDate } from "@/lib/dates";
import {
  signatureCertificationStatement,
  signatureConfirmationCheckboxLanguageFor,
  type ApproximateIpLocation
} from "@/lib/signatureAudit";
import type { ApplicationData } from "@/lib/types";
import { fullName } from "@/lib/types";

export type SignatureCertificateInput = {
  submissionId: string;
  submittedAt: Date;
  application: ApplicationData;
  certifiedDocuments: string[];
  ipAddress: string;
  approximateIpLocation: ApproximateIpLocation;
};

const pageWidth = 612;
const pageHeight = 792;
const margin = 54;
const bodySize = 10.5;
const headingSize = 13;
const titleSize = 22;
const subtitleSize = 12;
const lineHeight = 14;
const labelWidth = 132;

export async function generateSignatureCertificatePdf(input: SignatureCertificateInput) {
  const pdfDoc = await PDFDocument.create();
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const ensureSpace = (height: number) => {
    if (y >= margin + height) return;
    page = pdfDoc.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
  };

  const drawText = (text: string, options: { font?: PDFFont; size?: number; indent?: number; gapAfter?: number } = {}) => {
    const font = options.font || regularFont;
    const size = options.size || bodySize;
    const indent = options.indent || 0;
    const maxWidth = pageWidth - margin * 2 - indent;
    const lines = wrapText(text, font, size, maxWidth);
    for (const line of lines) {
      ensureSpace(lineHeight);
      page.drawText(line, {
        x: margin + indent,
        y,
        size,
        font,
        color: rgb(0.08, 0.1, 0.12)
      });
      y -= lineHeight;
    }
    y -= options.gapAfter || 0;
  };

  const drawSection = (title: string) => {
    y -= 12;
    ensureSpace(42);
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 0.8,
      color: rgb(0.72, 0.76, 0.74)
    });
    y -= 18;
    drawText(title, { font: boldFont, size: headingSize });
    y -= 4;
  };

  const drawRow = (label: string, value: string) => {
    ensureSpace(lineHeight * 2);
    const valueX = margin + labelWidth;
    const valueMaxWidth = pageWidth - margin - valueX;
    const valueLines = wrapText(value || "Not provided", regularFont, bodySize, valueMaxWidth);
    page.drawText(label, {
      x: margin,
      y,
      size: bodySize,
      font: boldFont,
      color: rgb(0.08, 0.1, 0.12)
    });
    valueLines.forEach((line, index) => {
      page.drawText(line, {
        x: valueX,
        y: y - index * lineHeight,
        size: bodySize,
        font: regularFont,
        color: rgb(0.08, 0.1, 0.12)
      });
    });
    y -= Math.max(1, valueLines.length) * lineHeight + 3;
  };

  page.drawText("Certificate of Signature", {
    x: margin,
    y,
    size: titleSize,
    font: boldFont,
    color: rgb(0.02, 0.35, 0.25)
  });
  y -= 20;
  page.drawText("camo-help.com", {
    x: margin,
    y,
    size: subtitleSize,
    font: boldFont,
    color: rgb(0.08, 0.1, 0.12)
  });
  y -= 22;
  drawText("This certificate records the signature and submission information collected by camo-help.com", { gapAfter: 8 });

  drawRow("Reference ID:", input.submissionId);
  drawRow("Signer:", input.application.signatureName || fullName(input.application));
  drawRow("Time of signature:", formatPacificDateTime(input.submittedAt));
  drawRow("IP address:", input.ipAddress || "Unavailable");
  drawRow("IP Location:", input.approximateIpLocation.display || "Unavailable");
  y -= 4;
  drawRow("Email used:", input.application.email || "Not provided");
  drawRow("Phone number:", input.application.phone || "Not provided");

  drawSection("Certified Documents");
  input.certifiedDocuments.forEach((documentName) => drawText(`- ${documentName}`));
  y -= 4;
  drawRow("Document completed:", formatPacificLongDate(input.submittedAt));

  drawSection("Confirmation Info");
  drawText("Confirmation checkbox language accepted during submission:", { font: boldFont });
  signatureConfirmationCheckboxLanguageFor(input.application.requirementsNeeded).forEach((line) => drawText(`- ${line}`));
  y -= 2;
  drawText("Certification statement:", { font: boldFont });
  drawText(signatureCertificationStatement);

  return pdfDoc.save();
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
