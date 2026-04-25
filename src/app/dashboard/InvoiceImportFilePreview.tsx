import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type PdfJsModule = typeof import("pdfjs-dist");
type PdfLoadingTask = ReturnType<PdfJsModule["getDocument"]>;
type PdfDocument = Awaited<PdfLoadingTask["promise"]>;
type PdfPage = Awaited<ReturnType<PdfDocument["getPage"]>>;
type PdfRenderTask = ReturnType<PdfPage["render"]>;
type PdfRenderContext = {
  canvas: HTMLCanvasElement;
  outputScale: number;
  page: PdfPage;
};

function buildPdfPreviewUrl(fileUrl: string): string {
  return `${fileUrl}#toolbar=0&navpanes=0&scrollbar=0&zoom=page-fit&view=FitH`;
}

function configurePdfWorker(pdfjs: PdfJsModule) {
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();
}

function createPdfPageCanvas(fileName: string, pageNumber: number) {
  const canvas = document.createElement("canvas");
  canvas.setAttribute(
    "aria-label",
    `Preview of ${fileName}, page ${pageNumber}`,
  );
  canvas.className = "block w-full rounded-[14px] bg-white";

  return canvas;
}

function renderPdfPageToCanvas({
  canvas,
  outputScale,
  page,
}: PdfRenderContext): PdfRenderTask {
  const viewport = page.getViewport({ scale: 1.6 });
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas is not available.");

  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.aspectRatio = `${viewport.width} / ${viewport.height}`;

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  return page.render({
    canvas,
    canvasContext: context,
    transform:
      outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
    viewport,
  });
}

function PdfPreviewCanvas({ file, fileUrl }: { file: File; fileUrl: string }) {
  const pagesRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const renderTasks: PdfRenderTask[] = [];
    let loadingTask: PdfLoadingTask | null = null;
    let pdfDocument: PdfDocument | null = null;

    async function renderPdfDocument() {
      const pagesElement = pagesRef.current;
      if (!pagesElement) return;

      setError(null);
      setIsRendering(true);

      try {
        pagesElement.replaceChildren();
        const pdfjs = await import("pdfjs-dist");
        configurePdfWorker(pdfjs);

        const data = new Uint8Array(await file.arrayBuffer());
        loadingTask = pdfjs.getDocument({ data });
        const pdf = await loadingTask.promise;
        pdfDocument = pdf;
        if (cancelled) return;

        const outputScale = window.devicePixelRatio || 1;
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          if (cancelled) return;

          const canvas = createPdfPageCanvas(file.name, pageNumber);
          pagesElement.append(canvas);
          const renderTask = renderPdfPageToCanvas({
            canvas,
            outputScale,
            page,
          });
          renderTasks.push(renderTask);
          await renderTask.promise;
          if (cancelled) return;
        }
        if (!cancelled) setIsRendering(false);
      } catch {
        if (!cancelled) {
          setError("PDF preview is unavailable in this browser.");
          setIsRendering(false);
        }
      }
    }

    void renderPdfDocument();

    return () => {
      cancelled = true;
      renderTasks.forEach((renderTask) => renderTask.cancel());
      void loadingTask?.destroy();
      void pdfDocument?.destroy();
    };
  }, [file]);

  return (
    <div className="relative bg-white">
      {isRendering || error ? (
        <div className="absolute inset-0 z-10 flex min-h-80 items-center justify-center bg-white px-6 text-center text-sm text-slate-600">
          {error ?? "Rendering PDF preview."}
        </div>
      ) : null}
      <div ref={pagesRef} className="flex flex-col gap-4 bg-white" />
      <span className="sr-only">{`Preview of ${file.name}`}</span>
      <a className="sr-only" href={buildPdfPreviewUrl(fileUrl)}>
        Open PDF preview
      </a>
    </div>
  );
}

function PreviewSurface({
  file,
  fileUrl,
  fullscreen,
}: {
  file: File;
  fileUrl: string;
  fullscreen: boolean;
}) {
  const isPdf = file.type === "application/pdf";
  const imageFrameClass = fullscreen
    ? "h-full w-full rounded-[24px] bg-white shadow-[0_30px_80px_rgba(15,23,42,0.35)]"
    : "h-[min(58svh,560px)] w-full rounded-[22px] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.16)] sm:h-[min(68svh,760px)] xl:h-[min(82svh,1180px)]";

  if (isPdf) {
    return (
      <div
        className={
          fullscreen
            ? "mx-auto w-full max-w-[980px] overflow-hidden rounded-[24px] bg-white shadow-[0_30px_80px_rgba(15,23,42,0.35)]"
            : "mx-auto w-full overflow-hidden rounded-[22px] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.16)]"
        }
      >
        <div className="w-full overflow-hidden bg-white">
          <PdfPreviewCanvas file={file} fileUrl={fileUrl} />
        </div>
      </div>
    );
  }

  return (
    <Image
      src={fileUrl}
      alt={`Preview of ${file.name}`}
      width={1800}
      height={2400}
      unoptimized
      className={`${imageFrameClass} bg-[linear-gradient(180deg,#f8fafc,#e2e8f0)] object-contain dark:bg-[linear-gradient(180deg,#0f172a,#020617)]`}
    />
  );
}

function FullscreenButton({
  fileName,
  onClick,
}: {
  fileName: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Open full screen preview of ${fileName}`}
      onClick={onClick}
      className="absolute right-3 top-3 z-20 inline-flex size-10 items-center justify-center rounded-full bg-white/92 text-slate-950 shadow-[0_12px_32px_rgba(15,23,42,0.18)] backdrop-blur transition hover:bg-white dark:bg-slate-50/92 dark:text-slate-950"
    >
      <span className="sr-only">Open full screen</span>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M7 3H3v4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13 3h4v4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3 13v4h4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M17 13v4h-4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="m7 3-4 4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="m13 3 4 4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="m3 13 4 4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="m17 13-4 4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

export default function InvoiceImportFilePreview({
  file,
  fileUrl,
  isLightboxOpen,
  onOpenLightbox,
  onCloseLightbox,
}: {
  file: File;
  fileUrl: string | null;
  isLightboxOpen: boolean;
  onOpenLightbox: () => void;
  onCloseLightbox: () => void;
}) {
  const isPdf = file.type === "application/pdf";
  const isImage = file.type.startsWith("image/");
  const canPreviewInline = fileUrl && (isPdf || isImage);
  const fullscreenDialogClass = isPdf
    ? "relative z-10 mx-auto w-full max-w-[980px]"
    : "relative z-10 mx-auto flex h-full w-full max-w-[1700px] flex-col rounded-[28px] border border-white/12 bg-slate-950/92 p-3 shadow-[0_30px_80px_rgba(0,0,0,0.45)] md:p-5";
  const fullscreenSurfaceClass = isPdf
    ? "relative"
    : "relative min-h-0 flex-1 overflow-hidden rounded-[24px] bg-slate-900";
  const lightbox =
    isLightboxOpen && canPreviewInline ? (
      <div
        className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 p-3 backdrop-blur md:p-6"
        role="dialog"
        aria-modal="true"
        aria-label={`Full preview of ${file.name}`}
      >
        <button
          type="button"
          onClick={onCloseLightbox}
          className="absolute inset-0 block h-full w-full cursor-default"
        >
          <span className="sr-only">Close preview backdrop</span>
        </button>
        <button
          type="button"
          onClick={onCloseLightbox}
          className="absolute right-5 top-5 z-20 inline-flex items-center justify-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 shadow-[0_18px_40px_rgba(0,0,0,0.25)] transition hover:bg-slate-100"
        >
          Close preview
        </button>

        <div className="flex min-h-full items-start justify-center">
          <div className={fullscreenDialogClass}>
            <div className={fullscreenSurfaceClass}>
              <PreviewSurface file={file} fileUrl={fileUrl} fullscreen />
            </div>
          </div>
        </div>
      </div>
    ) : null;

  return (
    <>
      <section className="overflow-hidden rounded-[28px] border border-slate-300/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(241,245,249,0.92))] p-3 shadow-[0_24px_60px_rgba(15,23,42,0.12)] dark:border-slate-700/70 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.94))]">
        <div className="relative overflow-hidden rounded-[24px] border border-slate-300/60 bg-[radial-gradient(circle_at_top,rgba(148,163,184,0.22),transparent_58%),linear-gradient(180deg,rgba(248,250,252,0.96),rgba(226,232,240,0.86))] p-2 dark:border-slate-700/60 dark:bg-[radial-gradient(circle_at_top,rgba(71,85,105,0.34),transparent_58%),linear-gradient(180deg,rgba(15,23,42,0.94),rgba(2,6,23,0.98))]">
          {canPreviewInline ? (
            <>
              <FullscreenButton fileName={file.name} onClick={onOpenLightbox} />
              <PreviewSurface
                file={file}
                fileUrl={fileUrl}
                fullscreen={false}
              />
            </>
          ) : null}

          {!canPreviewInline ? (
            <div className="flex h-[min(82vh,1180px)] items-center justify-center px-6 text-center text-sm text-slate-500 dark:text-slate-400">
              This file type cannot be previewed inline.
            </div>
          ) : null}
        </div>
      </section>

      {lightbox
        ? typeof document === "undefined"
          ? lightbox
          : createPortal(lightbox, document.body)
        : null}
    </>
  );
}
