import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { InvoiceImportDraft } from "@/lib/invoice-import-types";
import {
  buildPreview,
  findControlByLabel,
  hostProps,
} from "./InvoiceImportRowEditorTestUtils";
import {
  InvoiceSection,
  PaymentSection,
  VendorSection,
} from "./InvoiceImportReviewSections";

function captureDraftUpdates() {
  const updates: InvoiceImportDraft[] = [];
  return {
    updates,
    setDraft(nextDraft: InvoiceImportDraft) {
      updates.push(nextDraft);
    },
  };
}

it("renders vendor match messaging and updates vendor fields", () => {
  const preview = buildPreview({
    reviewed: true,
  });
  const { updates, setDraft } = captureDraftUpdates();
  const matchedMarkup = renderToStaticMarkup(
    <VendorSection draft={preview.draft} setDraft={setDraft} />,
  );

  expect(matchedMarkup).toContain("Preview match: Vendor OÜ.");

  const unmatchedDraft = {
    ...preview.draft,
    vendor: {
      ...preview.draft.vendor,
      existingVendorId: null,
      existingVendorName: null,
    },
  };
  expect(
    renderToStaticMarkup(
      <VendorSection draft={unmatchedDraft} setDraft={setDraft} />,
    ),
  ).toContain("No exact vendor match was found in preview.");

  const tree = <VendorSection draft={preview.draft} setDraft={setDraft} />;

  hostProps(findControlByLabel(tree, "Name", "input")).onChange?.({
    target: { value: "Updated Vendor" },
  });
  expect(updates.at(-1)?.vendor.name).toBe("Updated Vendor");

  hostProps(findControlByLabel(tree, "Registry code", "input")).onChange?.({
    target: { value: "" },
  });
  expect(updates.at(-1)?.vendor.regCode).toBeNull();

  hostProps(findControlByLabel(tree, "VAT number", "input")).onChange?.({
    target: { value: "EE123" },
  });
  expect(updates.at(-1)?.vendor.vatNumber).toBe("EE123");

  hostProps(findControlByLabel(tree, "VAT number", "input")).onChange?.({
    target: { value: "" },
  });
  expect(updates.at(-1)?.vendor.vatNumber).toBeNull();
});

it("updates invoice identity fields", () => {
  const preview = buildPreview({
    reviewed: true,
  });
  const { updates, setDraft } = captureDraftUpdates();
  const tree = <InvoiceSection draft={preview.draft} setDraft={setDraft} />;

  hostProps(findControlByLabel(tree, "Invoice number", "input")).onChange?.({
    target: { value: "INV-2" },
  });
  expect(updates.at(-1)?.invoice.invoiceNumber).toBe("INV-2");

  hostProps(findControlByLabel(tree, "Issue date", "input")).onChange?.({
    target: { value: "2026-04-21" },
  });
  expect(updates.at(-1)?.invoice.issueDate).toBe("2026-04-21");

  hostProps(findControlByLabel(tree, "Due date", "input")).onChange?.({
    target: { value: "" },
  });
  expect(updates.at(-1)?.invoice.dueDate).toBeNull();

  hostProps(findControlByLabel(tree, "Currency", "input")).onChange?.({
    target: { value: "USD" },
  });
  expect(updates.at(-1)?.invoice.currency).toBe("USD");
});

it("updates invoice amount, rounding, and notes fields", () => {
  const preview = buildPreview({
    reviewed: true,
  });
  const { updates, setDraft } = captureDraftUpdates();
  const tree = <InvoiceSection draft={preview.draft} setDraft={setDraft} />;
  const markup = renderToStaticMarkup(tree);

  expect(markup).toContain('value="145,08"');
  expect(markup).toContain('value="34,82"');
  expect(markup).toContain('value="179,90"');

  hostProps(findControlByLabel(tree, "Net amount", "input")).onChange?.({
    target: { value: "200" },
  });
  expect(updates.at(-1)?.invoice.amountExcludingVat).toBe(200);

  hostProps(findControlByLabel(tree, "VAT amount", "input")).onChange?.({
    target: { value: "" },
  });
  expect(updates.at(-1)?.invoice.vatAmount).toBeNull();

  hostProps(findControlByLabel(tree, "Total amount", "input")).onChange?.({
    target: { value: "244" },
  });
  expect(updates.at(-1)?.invoice.totalAmount).toBe(244);

  hostProps(findControlByLabel(tree, "Rounding amount", "input")).onChange?.({
    target: { value: "0,01" },
  });
  expect(updates.at(-1)?.invoice.roundingAmount).toBe(0.01);

  hostProps(findControlByLabel(tree, "Notes", "textarea")).onChange?.({
    target: { value: "Updated note" },
  });
  expect(updates.at(-1)?.invoice.notes).toBe("Updated note");
});

it("renders empty invoice optionals and clears amount and note fields back to null", () => {
  const preview = buildPreview({
    reviewed: true,
  });
  preview.draft.invoice.amountExcludingVat = null;
  preview.draft.invoice.vatAmount = null;
  preview.draft.invoice.totalAmount = null;
  preview.draft.invoice.roundingAmount = null;
  preview.draft.invoice.notes = null;
  const { updates, setDraft } = captureDraftUpdates();
  const tree = <InvoiceSection draft={preview.draft} setDraft={setDraft} />;
  const markup = renderToStaticMarkup(tree);

  expect(markup).not.toContain(">null<");

  hostProps(findControlByLabel(tree, "Net amount", "input")).onChange?.({
    target: { value: "" },
  });
  expect(updates.at(-1)?.invoice.amountExcludingVat).toBeNull();

  hostProps(findControlByLabel(tree, "VAT amount", "input")).onChange?.({
    target: { value: "22" },
  });
  expect(updates.at(-1)?.invoice.vatAmount).toBe(22);

  hostProps(findControlByLabel(tree, "Total amount", "input")).onChange?.({
    target: { value: "" },
  });
  expect(updates.at(-1)?.invoice.totalAmount).toBeNull();

  hostProps(findControlByLabel(tree, "Rounding amount", "input")).onChange?.({
    target: { value: "" },
  });
  expect(updates.at(-1)?.invoice.roundingAmount).toBeNull();

  hostProps(findControlByLabel(tree, "Notes", "textarea")).onChange?.({
    target: { value: "" },
  });
  expect(updates.at(-1)?.invoice.notes).toBeNull();
});

it("updates payment toggles and fields, including empty fallbacks", () => {
  const preview = buildPreview({
    reviewed: true,
  });
  preview.referenceData.paymentAccounts = [
    { name: "Main bank", type: "BANK" },
    { name: "Petty cash", type: "CASH" },
  ];
  const { updates, setDraft } = captureDraftUpdates();
  const tree = (
    <PaymentSection
      preview={preview}
      draft={preview.draft}
      setDraft={setDraft}
    />
  );
  const markup = renderToStaticMarkup(tree);

  expect(markup).toContain("No account selected");
  expect(markup).toContain("BANK - Main bank");

  hostProps(
    findControlByLabel(tree, "Record payment on confirm", "input"),
  ).onChange?.({
    target: { checked: true },
  });
  expect(updates.at(-1)?.actions.recordPayment).toBe(true);
  expect(updates.at(-1)?.payment.isPaid).toBe(true);

  hostProps(findControlByLabel(tree, "Payment date", "input")).onChange?.({
    target: { value: "2026-04-20" },
  });
  expect(updates.at(-1)?.payment.paymentDate).toBe("2026-04-20");

  hostProps(findControlByLabel(tree, "Payment amount", "input")).onChange?.({
    target: { value: "" },
  });
  expect(updates.at(-1)?.payment.paymentAmount).toBeNull();

  hostProps(findControlByLabel(tree, "Payment channel", "select")).onChange?.({
    target: { value: "CASH" },
  });
  expect(updates.at(-1)?.payment.paymentChannelHint).toBe("CASH");

  hostProps(findControlByLabel(tree, "Payment account", "select")).onChange?.({
    target: { value: "Main bank" },
  });
  expect(updates.at(-1)?.payment.paymentAccountName).toBe("Main bank");
});

it("clears payment fields back to null when the reviewer resets them", () => {
  const preview = buildPreview({
    reviewed: true,
  });
  const { updates, setDraft } = captureDraftUpdates();
  const tree = (
    <PaymentSection
      preview={preview}
      draft={preview.draft}
      setDraft={setDraft}
    />
  );

  hostProps(findControlByLabel(tree, "Payment date", "input")).onChange?.({
    target: { value: "" },
  });
  expect(updates.at(-1)?.payment.paymentDate).toBeNull();

  hostProps(findControlByLabel(tree, "Payment amount", "input")).onChange?.({
    target: { value: "146.4" },
  });
  expect(updates.at(-1)?.payment.paymentAmount).toBe(146.4);

  hostProps(findControlByLabel(tree, "Payment channel", "select")).onChange?.({
    target: { value: "" },
  });
  expect(updates.at(-1)?.payment.paymentChannelHint).toBeNull();

  hostProps(findControlByLabel(tree, "Payment account", "select")).onChange?.({
    target: { value: "" },
  });
  expect(updates.at(-1)?.payment.paymentAccountName).toBeNull();
});
