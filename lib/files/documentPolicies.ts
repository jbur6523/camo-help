export const submissionPerFileLimitBytes = 4 * 1024 * 1024;

// Vercel Functions accept an approximately 4.5 MB request body. A 3 MB file
// leaves at least 1.5 MB for multipart headers and other request fields.
export const documentCheckPerFileLimitBytes = 3 * 1024 * 1024;
