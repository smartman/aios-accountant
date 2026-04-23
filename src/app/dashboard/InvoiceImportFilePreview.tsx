import Image from "next/image";

function buildPdfPreviewUrl(fileUrl: string): string {
  return `${fileUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`;
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
  const frameClass = fullscreen
    ? "h-full w-full rounded-[24px] bg-white shadow-[0_30px_80px_rgba(15,23,42,0.35)]"
    : "h-[min(82vh,1180px)] w-full rounded-[22px] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.16)]";

  if (isPdf) {
    return (
      <iframe
        title={`Preview of ${file.name}`}
        src={buildPdfPreviewUrl(fileUrl)}
        className={frameClass}
      />
    );
  }

  return (
    <Image
      src={fileUrl}
      alt={`Preview of ${file.name}`}
      width={1800}
      height={2400}
      unoptimized
      className={`${frameClass} object-contain ${
        fullscreen
          ? "bg-[linear-gradient(180deg,#f8fafc,#e2e8f0)] dark:bg-[linear-gradient(180deg,#0f172a,#020617)]"
          : "bg-[linear-gradient(180deg,#f8fafc,#e2e8f0)] dark:bg-[linear-gradient(180deg,#0f172a,#020617)]"
      }`}
    />
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

  return (
    <>
      <section className="sticky top-24 overflow-hidden rounded-[28px] border border-slate-300/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(241,245,249,0.92))] p-3 shadow-[0_24px_60px_rgba(15,23,42,0.12)] dark:border-slate-700/70 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.94))]">
        <div className="relative overflow-hidden rounded-[24px] border border-slate-300/60 bg-[radial-gradient(circle_at_top,rgba(148,163,184,0.22),transparent_58%),linear-gradient(180deg,rgba(248,250,252,0.96),rgba(226,232,240,0.86))] p-2 dark:border-slate-700/60 dark:bg-[radial-gradient(circle_at_top,rgba(71,85,105,0.34),transparent_58%),linear-gradient(180deg,rgba(15,23,42,0.94),rgba(2,6,23,0.98))]">
          {canPreviewInline ? (
            <>
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-20 bg-gradient-to-b from-slate-950/14 to-transparent dark:from-black/35" />
              <div className="pointer-events-none absolute left-5 top-5 z-20 flex items-center gap-2">
                <span className="rounded-full bg-white/88 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-[0_8px_24px_rgba(15,23,42,0.12)] backdrop-blur dark:bg-slate-900/82 dark:text-slate-200">
                  {file.name}
                </span>
              </div>
              <button
                type="button"
                aria-label={`Open full screen preview of ${file.name}`}
                onClick={onOpenLightbox}
                className="absolute inset-0 z-20 block cursor-zoom-in"
              >
                <span className="pointer-events-none absolute bottom-5 right-5 rounded-full bg-slate-950/82 px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_32px_rgba(15,23,42,0.28)] backdrop-blur dark:bg-slate-50/92 dark:text-slate-950">
                  Open full screen
                </span>
              </button>
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

      {isLightboxOpen && canPreviewInline ? (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 p-3 backdrop-blur md:p-6"
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

          <div className="relative z-10 mx-auto flex h-full w-full max-w-[1700px] flex-col rounded-[28px] border border-white/12 bg-slate-950/92 p-3 shadow-[0_30px_80px_rgba(0,0,0,0.45)] md:p-5">
            <div className="mb-3 pr-36">
              <p className="truncate text-sm font-semibold text-white/88">
                {file.name}
              </p>
            </div>

            <div className="relative min-h-0 flex-1 overflow-hidden rounded-[24px] bg-slate-900">
              <button
                type="button"
                onClick={onCloseLightbox}
                className="absolute inset-0 z-10 block h-full w-full cursor-zoom-out"
              >
                <span className="sr-only">Close preview surface</span>
              </button>
              <PreviewSurface file={file} fileUrl={fileUrl} fullscreen />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
