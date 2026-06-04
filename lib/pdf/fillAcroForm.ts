import { PDFCheckBox, PDFDocument, PDFTextField } from "pdf-lib";
import type { AcroFormFieldPlan } from "@/lib/pdf/pdfFieldNameMap";

export type FillAcroFormOptions = {
  signatureDataUrl?: string;
  warn?: (message: string) => void;
};

type SignatureRect = {
  fieldName: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export async function fillAcroForm(pdfDoc: PDFDocument, plan: AcroFormFieldPlan, options: FillAcroFormOptions = {}) {
  const warnings: string[] = [];
  const warn = (message: string) => {
    warnings.push(message);
    options.warn?.(message);
  };
  const signatureFieldSet = new Set(plan.signatureFields || []);
  const signatureRects = collectSignatureRects(pdfDoc, plan.signatureFields || [], warn);
  const hasDrawnSignature = Boolean(options.signatureDataUrl);

  const form = pdfDoc.getForm();
  for (const [fieldName, value] of Object.entries(plan.text)) {
    if (hasDrawnSignature && signatureFieldSet.has(fieldName)) {
      setTextField(form, fieldName, "", warn);
    } else {
      setTextField(form, fieldName, value || "", warn);
    }
  }

  for (const [fieldName, checked] of Object.entries(plan.checkboxes)) {
    setCheckbox(form, fieldName, checked, warn);
  }

  form.updateFieldAppearances();
  form.flatten();

  if (options.signatureDataUrl) {
    await drawSignatureImage(pdfDoc, signatureRects, options.signatureDataUrl, warn);
  }

  if (!hasDrawnSignature && plan.signatureFields?.length) {
    warn("No drawn signature image was provided. Typed legal name was used as the signature fallback; CAMO may still require official signing.");
  }

  return warnings;
}

function setTextField(form: ReturnType<PDFDocument["getForm"]>, fieldName: string, value: string, warn: (message: string) => void) {
  try {
    form.getTextField(fieldName).setText(value);
  } catch {
    const field = form.getFields().find((candidate) => candidate.getName() === fieldName);
    if (field instanceof PDFTextField) {
      field.setText(value);
      return;
    }
    warn(`Missing text field: ${fieldName}`);
  }
}

function setCheckbox(form: ReturnType<PDFDocument["getForm"]>, fieldName: string, checked: boolean, warn: (message: string) => void) {
  try {
    const box = form.getCheckBox(fieldName);
    if (checked) {
      box.check();
    } else {
      box.uncheck();
    }
  } catch {
    const field = form.getFields().find((candidate) => candidate.getName() === fieldName);
    if (field instanceof PDFCheckBox) {
      if (checked) {
        field.check();
      } else {
        field.uncheck();
      }
      return;
    }
    warn(`Missing checkbox field: ${fieldName}`);
  }
}

function collectSignatureRects(pdfDoc: PDFDocument, fieldNames: string[], warn: (message: string) => void): SignatureRect[] {
  const form = pdfDoc.getForm();
  return fieldNames.flatMap((fieldName) => {
    const field = form.getFields().find((candidate) => candidate.getName() === fieldName);
    if (!field) {
      warn(`Missing signature field: ${fieldName}`);
      return [];
    }

    const acroField = (field as unknown as { acroField?: { getWidgets?: () => unknown[] } }).acroField;
    const widgets = acroField?.getWidgets?.() || [];
    return widgets.flatMap((widget) => {
      const widgetLike = widget as {
        getRectangle?: () => { x: number; y: number; width: number; height: number };
        P?: () => unknown;
      };
      const rect = widgetLike.getRectangle?.();
      const pageRef = widgetLike.P?.();
      const pageIndex = pdfDoc.getPages().findIndex((page) => page.ref === pageRef);
      if (!rect || pageIndex < 0) return [];
      return [{ fieldName, pageIndex, ...rect }];
    });
  });
}

async function drawSignatureImage(
  pdfDoc: PDFDocument,
  rects: SignatureRect[],
  dataUrl: string,
  warn: (message: string) => void
) {
  if (!rects.length) return;
  const imageBytes = dataUrlToBytes(dataUrl);
  const image = dataUrl.includes("image/jpeg") || dataUrl.includes("image/jpg")
    ? await pdfDoc.embedJpg(imageBytes)
    : await pdfDoc.embedPng(imageBytes);

  for (const rect of rects) {
    const page = pdfDoc.getPage(rect.pageIndex);
    const scale = Math.min(rect.width / image.width, rect.height / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    page.drawImage(image, {
      x: rect.x + (rect.width - width) / 2,
      y: rect.y + (rect.height - height) / 2,
      width,
      height
    });
  }
  warn("Drawn signature image was embedded into the flattened PDF.");
}

function dataUrlToBytes(dataUrl: string) {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  if (typeof atob === "function") {
    return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  }
  return Uint8Array.from(Buffer.from(base64, "base64"));
}
