import { afterEach, describe, expect, it, vi } from "vitest";
import {
  shortenAttachmentFilename,
  uploadDocumentAttachment,
} from "./smartaccounts-attachments";

function buildCredentials(seed: string) {
  return {
    apiKey: `smart-api-${seed}`,
    secretKey: `smart-secret-${seed}`,
  };
}

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    json: async () => payload,
  } as Response;
}

function errorResponse(status: number, payload: string): Response {
  return {
    ok: false,
    status,
    statusText: "Error",
    text: async () => payload,
  } as Response;
}

function readRequestFileName(
  call: [unknown, RequestInit?] | undefined,
): string {
  const requestInit = call?.[1];
  if (!requestInit || typeof requestInit !== "object") {
    throw new Error("Expected request init options.");
  }

  const body = requestInit.body;
  if (typeof body !== "string") {
    throw new Error("Expected a JSON request body.");
  }

  return (JSON.parse(body) as { fileName: string }).fileName;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("smartaccounts attachment filenames", () => {
  it("preserves file extensions when shortening long filenames", () => {
    const shortened = shortenAttachmentFilename(`${"a".repeat(140)}.pdf`, 64);

    expect(shortened).toHaveLength(64);
    expect(shortened.endsWith(".pdf")).toBe(true);
  });

  it("shortens filenames without extensions and falls back when the extension is longer than the limit", () => {
    expect(shortenAttachmentFilename("nested/path/invoice", 6)).toBe("invoic");
    expect(shortenAttachmentFilename("invoice.really-long-extension", 4)).toBe(
      "invo",
    );
  });

  it("proactively shortens risky filenames before uploading", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ ok: true }));

    await uploadDocumentAttachment({
      credentials: buildCredentials("long-name"),
      docId: "invoice-1",
      filename: `${"b".repeat(140)}.pdf`,
      mimeType: "application/pdf",
      fileContentBase64: "ZmFrZQ==",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(readRequestFileName(fetchMock.mock.calls[0])).toHaveLength(64);
  });

  it("sends already-short filenames unchanged", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ ok: true }));

    await uploadDocumentAttachment({
      credentials: buildCredentials("short-name"),
      docId: "invoice-2",
      filename: "invoice.pdf",
      mimeType: "application/pdf",
      fileContentBase64: "ZmFrZQ==",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(readRequestFileName(fetchMock.mock.calls[0])).toBe("invoice.pdf");
  });

  it("surfaces SmartAccounts upload failures", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(errorResponse(400, "Attachment rejected"));

    await expect(
      uploadDocumentAttachment({
        credentials: buildCredentials("attachment-error"),
        docId: "invoice-3",
        filename: "invoice.pdf",
        mimeType: "application/pdf",
        fileContentBase64: "ZmFrZQ==",
      }),
    ).rejects.toThrow("SmartAccounts 400: Attachment rejected");

    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
