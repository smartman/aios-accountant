import { SmartAccountsCredentials } from "./accounting-provider-types";
import { smartAccountsRequest } from "./smartaccounts-core";

const DEFAULT_ATTACHMENT_FILENAME = "attachment";
const SMARTACCOUNTS_ATTACHMENT_FILENAME_MAX_LENGTH = 64;

function sanitizeAttachmentFilename(filename: string): string {
  const basename = filename.split(/[/\\]/).pop()?.trim();
  return basename || DEFAULT_ATTACHMENT_FILENAME;
}

function splitAttachmentFilename(filename: string): {
  name: string;
  extension: string;
} {
  const extensionStart = filename.lastIndexOf(".");
  if (extensionStart <= 0 || extensionStart === filename.length - 1) {
    return { name: filename, extension: "" };
  }

  return {
    name: filename.slice(0, extensionStart),
    extension: filename.slice(extensionStart),
  };
}

export function shortenAttachmentFilename(filename: string, maxLength: number) {
  const sanitizedFilename = sanitizeAttachmentFilename(filename);
  if (sanitizedFilename.length <= maxLength) {
    return sanitizedFilename;
  }

  const { name, extension } = splitAttachmentFilename(sanitizedFilename);
  const maxNameLength = maxLength - extension.length;
  if (maxNameLength <= 0) {
    return sanitizedFilename.slice(0, maxLength);
  }

  return `${name.slice(0, maxNameLength)}${extension}`;
}

export async function uploadDocumentAttachment(params: {
  credentials: SmartAccountsCredentials;
  docId: string;
  filename: string;
  mimeType: string;
  fileContentBase64: string;
}): Promise<void> {
  await smartAccountsRequest("/general/files", "add", params.credentials, {
    httpMethod: "POST",
    body: {
      docId: params.docId,
      docType: "VENDOR_INVOICE",
      fileName: shortenAttachmentFilename(
        params.filename,
        SMARTACCOUNTS_ATTACHMENT_FILENAME_MAX_LENGTH,
      ),
      mimeType: params.mimeType,
      fileContent: params.fileContentBase64,
      description: "Uploaded via invoice import",
    },
  });
}
