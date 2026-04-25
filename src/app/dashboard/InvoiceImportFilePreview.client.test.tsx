// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import InvoiceImportFilePreview from "./InvoiceImportFilePreview";

const pdfMocks = vi.hoisted(() => {
  const renderTask = {
    cancel: vi.fn(),
    promise: Promise.resolve(),
  };
  const page = {
    getViewport: vi.fn(() => ({ height: 200, width: 100 })),
    render: vi.fn(() => renderTask),
  };
  const pdf = {
    destroy: vi.fn(() => Promise.resolve()),
    getPage: vi.fn(() => Promise.resolve(page)),
  };
  const loadingTask = {
    destroy: vi.fn(() => Promise.resolve()),
    promise: Promise.resolve(pdf),
  };

  return {
    getDocument: vi.fn(() => loadingTask),
    loadingTask,
    page,
    pdf,
    renderTask,
  };
});

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: pdfMocks.getDocument,
}));

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, "devicePixelRatio", {
    configurable: true,
    value: 2,
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    fillRect: vi.fn(),
    fillStyle: "",
  } as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderPdfPreview(file: File) {
  return render(
    <InvoiceImportFilePreview
      file={file}
      fileUrl="blob:invoice-preview"
      isLightboxOpen={false}
      onOpenLightbox={() => undefined}
      onCloseLightbox={() => undefined}
    />,
  );
}

it("renders pdf files into a canvas preview", async () => {
  const file = new File(["pdf"], "printout.pdf", {
    type: "application/pdf",
  });

  renderPdfPreview(file);

  await waitFor(() =>
    expect(screen.queryByText("Rendering PDF preview.")).toBeNull(),
  );

  const canvas = screen.getByLabelText(
    "Preview of printout.pdf",
  ) as HTMLCanvasElement;
  expect(canvas.width).toBe(200);
  expect(canvas.height).toBe(400);
  expect(canvas.style.aspectRatio).toBe("100 / 200");
  expect(pdfMocks.getDocument).toHaveBeenCalledWith({
    data: new Uint8Array(await file.arrayBuffer()),
  });
  expect(pdfMocks.page.render).toHaveBeenCalledWith(
    expect.objectContaining({
      canvas,
      transform: [2, 0, 0, 2, 0, 0],
    }),
  );
});

it("cancels pdf rendering work when the preview unmounts", async () => {
  const file = new File(["pdf"], "cleanup.pdf", {
    type: "application/pdf",
  });

  const { unmount } = renderPdfPreview(file);

  await waitFor(() =>
    expect(screen.queryByText("Rendering PDF preview.")).toBeNull(),
  );
  unmount();

  expect(pdfMocks.renderTask.cancel).toHaveBeenCalled();
  expect(pdfMocks.loadingTask.destroy).toHaveBeenCalled();
  expect(pdfMocks.pdf.destroy).toHaveBeenCalled();
});

it("stops before loading a page when the pdf resolves after unmount", async () => {
  let resolvePdf: (pdf: typeof pdfMocks.pdf) => void = () => undefined;
  const loadingTask = {
    destroy: vi.fn(() => Promise.resolve()),
    promise: new Promise<typeof pdfMocks.pdf>((resolve) => {
      resolvePdf = resolve;
    }),
  };
  pdfMocks.getDocument.mockReturnValueOnce(
    loadingTask as unknown as ReturnType<typeof pdfMocks.getDocument>,
  );
  const file = new File(["pdf"], "late.pdf", {
    type: "application/pdf",
  });

  const { unmount } = renderPdfPreview(file);

  await waitFor(() => expect(pdfMocks.getDocument).toHaveBeenCalled());
  unmount();
  resolvePdf(pdfMocks.pdf);
  await Promise.resolve();

  expect(loadingTask.destroy).toHaveBeenCalled();
  expect(pdfMocks.pdf.getPage).not.toHaveBeenCalled();
});

it("renders pdf previews without a hidpi transform at device scale 1", async () => {
  Object.defineProperty(window, "devicePixelRatio", {
    configurable: true,
    value: 1,
  });
  const file = new File(["pdf"], "plain.pdf", {
    type: "application/pdf",
  });

  renderPdfPreview(file);

  await waitFor(() =>
    expect(screen.queryByText("Rendering PDF preview.")).toBeNull(),
  );

  expect(pdfMocks.page.render).toHaveBeenCalledWith(
    expect.objectContaining({
      transform: undefined,
    }),
  );
});

it("shows a fallback when pdf canvas rendering fails", async () => {
  pdfMocks.getDocument.mockImplementationOnce(() => {
    throw new Error("PDF render failed.");
  });
  const file = new File(["pdf"], "broken.pdf", {
    type: "application/pdf",
  });

  renderPdfPreview(file);

  expect(
    await screen.findByText("PDF preview is unavailable in this browser."),
  ).toBeTruthy();
});

it("shows a fallback when canvas rendering is unavailable", async () => {
  vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValueOnce(null);
  const file = new File(["pdf"], "no-canvas.pdf", {
    type: "application/pdf",
  });

  renderPdfPreview(file);

  expect(
    await screen.findByText("PDF preview is unavailable in this browser."),
  ).toBeTruthy();
});

it("renders image lightboxes through a browser portal", () => {
  const file = new File(["image"], "receipt.png", {
    type: "image/png",
  });

  render(
    <InvoiceImportFilePreview
      file={file}
      fileUrl="blob:image-preview"
      isLightboxOpen
      onOpenLightbox={() => undefined}
      onCloseLightbox={() => undefined}
    />,
  );

  expect(screen.getByRole("dialog").getAttribute("aria-label")).toBe(
    "Full preview of receipt.png",
  );
});
