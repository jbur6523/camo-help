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

const files = [
  "public/templates/Camo Athlete License - Fillable.pdf",
  "public/templates/National ID form 0 Fillable.pdf"
];

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  for (const file of files) {
    const pdf = await PDFDocument.load(await readFile(file));
    console.log(`\n${file}`);
    pdf.getPages().forEach((page, index) => {
      const { width, height } = page.getSize();
      console.log(`  page ${index + 1}: ${width} x ${height}`);
    });

    const fields = pdf.getForm().getFields();
    console.log(`  fillable fields: ${fields.length}`);
    fields
      .map((field) => ({ name: field.getName(), type: fieldType(field) }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((field) => console.log(`  - ${field.name} [${field.type}]`));
  }
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
