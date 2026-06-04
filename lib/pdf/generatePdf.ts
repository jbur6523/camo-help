import { PDFCheckBox, PDFDocument, PDFTextField, StandardFonts, rgb } from "pdf-lib";
import type { ApplicationData } from "@/lib/types";
import type { PdfFieldMap, PdfValue } from "@/lib/pdf/pdfFieldMap";

export async function generateMappedPdf(templateBytes: ArrayBuffer, data: ApplicationData, map: PdfFieldMap) {
  const pdfDoc = await PDFDocument.load(templateBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const form = pdfDoc.getForm();

  for (const [fieldName, value] of Object.entries(map.fillableFields)) {
    const text = resolveValue(value, data);
    try {
      const field = form.getFields().find((candidate) => candidate.getName() === fieldName);
      if (field instanceof PDFTextField) {
        field.setText(text);
      } else if (field instanceof PDFCheckBox && text.toLowerCase() === "yes") {
        field.check();
      }
    } catch {
      // Missing field names are expected when the source PDF is a flat document.
    }
  }

  const pages = pdfDoc.getPages();
  for (const item of map.overlays) {
    const page = pages[item.page];
    if (!page) continue;
    const text = resolveValue(item.value, data);
    const lines = wrapText(text, item.maxWidth || 460, item.size || 10);
    lines.forEach((line, lineIndex) => {
      page.drawText(line, {
        x: item.x,
        y: item.y - lineIndex * ((item.size || 10) + 3),
        size: item.size || 10,
        font,
        color: rgb(0.05, 0.07, 0.08)
      });
    });
  }

  for (const box of map.checkboxes) {
    if (!box.when(data)) continue;
    const page = pages[box.page];
    if (!page) continue;
    page.drawText("X", {
      x: box.x,
      y: box.y,
      size: 11,
      font: boldFont,
      color: rgb(0.05, 0.07, 0.08)
    });
  }

  try {
    form.flatten();
  } catch {
    // Some flat PDFs do not have a form to flatten.
  }

  return pdfDoc.save();
}

function resolveValue(value: PdfValue, data: ApplicationData) {
  if (typeof value === "function") return value(data);
  const raw = data[value];
  if (typeof raw === "string") return raw;
  if (typeof raw === "boolean") return raw ? "Yes" : "No";
  return raw == null ? "" : JSON.stringify(raw);
}

function wrapText(text: string, maxWidth: number, size: number) {
  const maxChars = Math.max(22, Math.floor(maxWidth / (size * 0.52)));
  return text
    .split("\n")
    .flatMap((paragraph) => {
      const words = paragraph.split(/\s+/).filter(Boolean);
      const lines: string[] = [];
      let line = "";
      for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (next.length > maxChars && line) {
          lines.push(line);
          line = word;
        } else {
          line = next;
        }
      }
      if (line) lines.push(line);
      return lines.length ? lines : [""];
    })
    .slice(0, 18);
}
