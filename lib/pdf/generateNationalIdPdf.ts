import type { ApplicationData } from "@/lib/types";
import { nationalIdFieldMap } from "@/lib/pdf/pdfFieldMap";
import { generateMappedPdf } from "@/lib/pdf/generatePdf";

export async function generateNationalIdPdf(templateBytes: ArrayBuffer, data: ApplicationData) {
  return generateMappedPdf(templateBytes, data, nationalIdFieldMap);
}
