import type { ApplicationData } from "@/lib/types";
import { athleteLicenseFieldMap } from "@/lib/pdf/pdfFieldMap";
import { generateMappedPdf } from "@/lib/pdf/generatePdf";

export async function generateAthleteLicensePdf(templateBytes: ArrayBuffer, data: ApplicationData) {
  return generateMappedPdf(templateBytes, data, athleteLicenseFieldMap);
}
