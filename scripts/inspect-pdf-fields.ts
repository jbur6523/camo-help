import { readFile } from "node:fs/promises";
import {
  PDFButton,
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFSignature,
  PDFTextField
} from "pdf-lib";
import { defaultApplicationData } from "@/lib/types";
import {
  athleteLicenseFieldPlan,
  athleteLicenseTemplatePath,
  athleteOverflowPlan,
  nationalIdFieldPlan,
  nationalIdTemplatePath
} from "@/lib/pdf/pdfFieldNameMap";
import { assertMappedPdfFieldsPresent } from "@/lib/pdf/validatePdfFieldMap";

const files = [
  {
    label: "Athlete License",
    path: publicTemplatePath(athleteLicenseTemplatePath),
    plan: athleteLicenseFieldPlan(defaultApplicationData, athleteOverflowPlan(defaultApplicationData))
  },
  {
    label: "National ID",
    path: publicTemplatePath(nationalIdTemplatePath),
    plan: nationalIdFieldPlan(defaultApplicationData)
  }
];

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  for (const file of files) {
    const pdf = await PDFDocument.load(await readFile(file.path));
    console.log(`\n${file.path}`);
    pdf.getPages().forEach((page, index) => {
      const { width, height } = page.getSize();
      console.log(`  page ${index + 1}: ${width} x ${height}`);
    });

    const fields = pdf.getForm().getFields();
    const fieldNames = fields.map((field) => field.getName());
    console.log(`  fillable fields: ${fields.length}`);
    fields
      .map((field) => ({ name: field.getName(), type: fieldType(field) }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((field) => console.log(`  - ${field.name} [${field.type}]`));

    const mappedFieldCount = assertMappedPdfFieldsPresent(file.label, file.plan, fieldNames);
    console.log(`  mapped fields present: ${mappedFieldCount}`);
  }
}

function publicTemplatePath(templatePath: string) {
  return `public/${templatePath.replace(/^\/+/, "")}`;
}

function fieldType(field: unknown) {
  if (field instanceof PDFTextField) return "text";
  if (field instanceof PDFCheckBox) return "checkbox";
  if (field instanceof PDFRadioGroup) return "radio";
  if (field instanceof PDFDropdown) return "dropdown";
  if (field instanceof PDFOptionList) return "option-list";
  if (field instanceof PDFButton) return "button";
  if (field instanceof PDFSignature) return "signature";
  return "unknown";
}
