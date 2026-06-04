import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";

const files = ["public/templates/Camo Athlete License(1).pdf", "public/templates/National ID form(1).pdf"];

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
    fields.forEach((field) => console.log(`  - ${field.getName()}`));
  }
}
