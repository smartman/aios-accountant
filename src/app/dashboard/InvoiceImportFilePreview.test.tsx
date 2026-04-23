import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import InvoiceImportFilePreview from "./InvoiceImportFilePreview";
import { findButton, hostProps } from "./InvoiceImportRowEditorTestUtils";

it("renders a compact pdf preview with a fullscreen action", () => {
  const file = new File(["a".repeat(2048)], "printout.pdf", {
    type: "application/pdf",
  });

  const markup = renderToStaticMarkup(
    <InvoiceImportFilePreview
      file={file}
      fileUrl="blob:invoice-preview"
      isLightboxOpen={false}
      onOpenLightbox={() => undefined}
      onCloseLightbox={() => undefined}
    />,
  );

  expect(markup).toContain("printout.pdf");
  expect(markup).toContain("Open full screen");
  expect(markup).toContain("Preview of printout.pdf");
  expect(markup).toContain(
    "blob:invoice-preview#toolbar=0&amp;navpanes=0&amp;scrollbar=0&amp;zoom=page-fit&amp;view=FitH",
  );
});

it("opens from the small preview click target and closes from the backdrop", () => {
  const file = new File(["a".repeat(2048)], "printout.pdf", {
    type: "application/pdf",
  });
  let opened = false;
  let closed = false;

  const tree = (
    <InvoiceImportFilePreview
      file={file}
      fileUrl="blob:invoice-preview"
      isLightboxOpen
      onOpenLightbox={() => {
        opened = true;
      }}
      onCloseLightbox={() => {
        closed = true;
      }}
    />
  );

  hostProps(findButton(tree, "Open full screen")!).onClick?.();
  expect(opened).toBe(true);

  hostProps(findButton(tree, "Close preview backdrop")!).onClick?.();
  expect(closed).toBe(true);
});

it("renders the fullscreen lightbox when requested", () => {
  const file = new File(["a".repeat(2048)], "printout.pdf", {
    type: "application/pdf",
  });

  const markup = renderToStaticMarkup(
    <InvoiceImportFilePreview
      file={file}
      fileUrl="blob:invoice-preview"
      isLightboxOpen
      onOpenLightbox={() => undefined}
      onCloseLightbox={() => undefined}
    />,
  );

  expect(markup).toContain("Close preview");
  expect(markup).toContain("Full preview of printout.pdf");
});

it("renders image previews without extra metadata chrome", () => {
  const file = new File(["a".repeat(1024 * 1024)], "invoice.png", {
    type: "image/png",
  });

  const markup = renderToStaticMarkup(
    <InvoiceImportFilePreview
      file={file}
      fileUrl="blob:image-preview"
      isLightboxOpen={false}
      onOpenLightbox={() => undefined}
      onCloseLightbox={() => undefined}
    />,
  );

  expect(markup).toContain("invoice.png");
  expect(markup).toContain("Preview of invoice.png");
});

it("renders the fallback state for unsupported files without a preview URL", () => {
  const file = new File(["abc"], "invoice.txt", {
    type: "text/plain",
  });

  const markup = renderToStaticMarkup(
    <InvoiceImportFilePreview
      file={file}
      fileUrl={null}
      isLightboxOpen={false}
      onOpenLightbox={() => undefined}
      onCloseLightbox={() => undefined}
    />,
  );

  expect(markup).toContain("cannot be previewed inline");
  expect(markup).not.toContain("Full screen");
});
