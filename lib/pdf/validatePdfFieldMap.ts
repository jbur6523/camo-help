import type { AcroFormFieldPlan } from "@/lib/pdf/pdfFieldNameMap";

export function missingMappedPdfFields(plan: AcroFormFieldPlan, fieldNames: readonly string[]) {
  const availableFields = new Set(fieldNames);
  const mappedFields = [
    ...Object.keys(plan.text),
    ...Object.keys(plan.checkboxes),
    ...(plan.signatureFields || [])
  ];

  return Array.from(new Set(mappedFields)).filter((fieldName) => !availableFields.has(fieldName));
}

export function assertMappedPdfFieldsPresent(label: string, plan: AcroFormFieldPlan, fieldNames: readonly string[]) {
  const missing = missingMappedPdfFields(plan, fieldNames);
  if (missing.length) {
    throw new Error(`Missing mapped fields for ${label}: ${missing.join(", ")}`);
  }

  return new Set([
    ...Object.keys(plan.text),
    ...Object.keys(plan.checkboxes),
    ...(plan.signatureFields || [])
  ]).size;
}
