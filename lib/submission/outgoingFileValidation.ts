import { submissionPerFileLimitBytes } from "@/lib/files/documentPolicies";

type OutgoingFileSummary = {
  size: number;
};

export const maxSingleOutgoingFileBytes = submissionPerFileLimitBytes;

export function submissionSizeProblem(files: OutgoingFileSummary[]) {
  return files.some((file) => file.size > maxSingleOutgoingFileBytes) ? fileTooLargeMessage() : "";
}

export function fileTooLargeMessage() {
  return [
    "One of your files is too large to submit.",
    "Please upload a smaller image or PDF.",
    "If you are uploading a full-resolution phone photo, try taking a screenshot of the image/document and uploading the screenshot instead. Screenshots are usually much smaller and are often easier to submit.",
    "For lab results, physical forms, or document images, you can also try saving the document as a smaller PDF, retaking the photo closer to the document, or cropping out unnecessary background before uploading."
  ].join(" ");
}
