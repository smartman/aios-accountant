import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import type { InvoiceBatchItem } from "./invoice-upload-batch";
import { InvoiceBatchQueue, InvoiceUploadCard } from "./InvoiceUploadQueue";
import {
  findButton,
  findFirstElementByTag,
  hostProps,
} from "./InvoiceImportRowEditorTestUtils";

function buildItem(
  status: InvoiceBatchItem["status"],
  overrides?: Partial<InvoiceBatchItem>,
): InvoiceBatchItem {
  return {
    id: `item-${status}`,
    file: new File(["invoice"], `${status}.pdf`, {
      type: "application/pdf",
    }),
    filePreviewUrl: null,
    status,
    preview: null,
    draft: null,
    result: null,
    error: null,
    ...overrides,
  };
}

it("renders queue statuses, retry actions, and active selection", () => {
  const onRetry = vi.fn();
  const onSelect = vi.fn();
  const items = [
    buildItem("ready"),
    buildItem("processing"),
    buildItem("queued"),
    buildItem("confirming"),
    buildItem("confirmed"),
    buildItem("failed", { error: "Could not read invoice." }),
  ];
  const tree = (
    <InvoiceBatchQueue
      items={items}
      activeItemId="item-ready"
      onRetry={onRetry}
      onSelect={onSelect}
    />
  );

  const markup = renderToStaticMarkup(tree);

  expect(markup).toContain("Ready");
  expect(markup).toContain("Preparing");
  expect(markup).toContain("Queued");
  expect(markup).toContain("Saving");
  expect(markup).toContain("Imported");
  expect(markup).toContain("Failed");
  expect(markup).toContain("Could not read invoice.");

  hostProps(findButton(tree, "ready.pdf")!).onClick?.();
  hostProps(findButton(tree, "Retry failed.pdf")!).onClick?.();

  expect(onSelect).toHaveBeenCalledWith("item-ready");
  expect(onRetry).toHaveBeenCalledWith("item-failed");
});

it("renders no queue when there are no files", () => {
  const markup = renderToStaticMarkup(
    <InvoiceBatchQueue
      items={[]}
      activeItemId={null}
      onRetry={() => undefined}
      onSelect={() => undefined}
    />,
  );

  expect(markup).toBe("");
});

it("passes selected files from the upload card and clears the input", () => {
  const onFileChange = vi.fn();
  const firstFile = new File(["one"], "one.pdf", { type: "application/pdf" });
  const secondFile = new File(["two"], "two.png", { type: "image/png" });
  const tree = (
    <InvoiceUploadCard
      canImport
      disabled={false}
      providerMessage="Imported invoices will be sent to SmartAccounts."
      onFileChange={onFileChange}
    />
  );
  const event = {
    target: { files: [firstFile, secondFile] },
    currentTarget: { value: "selected" },
  };

  hostProps(findFirstElementByTag(tree, "input")).onChange?.(event);

  expect(onFileChange).toHaveBeenCalledWith([firstFile, secondFile]);
  expect(event.currentTarget.value).toBe("");
});
