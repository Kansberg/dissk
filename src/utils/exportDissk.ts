import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import type {
  DownloadOptions,
  DownloadSize,
} from "../components/DownloadModal";

// A-formater i mm (portræt).
const PAPER_MM = {
  A0: { w: 841, h: 1189 },
  A1: { w: 594, h: 841 },
  A2: { w: 420, h: 594 },
  A3: { w: 297, h: 420 },
  A4: { w: 210, h: 297 },
} as const;

const PRINT_DPI = 300;
const ORIGINAL_LONG_EDGE = 5000;
const HIGH_RES_LONG_EDGE = 10000;

// Store canvases bruger meget RAM. Grænsen holder især A0/A1 anvendelige,
// mens mindre A-formater stadig eksporteres i fuld 300 DPI.
const MAX_CANVAS_EDGE = 16384;
const MAX_CANVAS_PIXELS = 64_000_000;

type PaperKey = keyof typeof PAPER_MM;
type Dimensions = { width: number; height: number };

function isPaperSize(size: DownloadSize): size is PaperKey {
  return size === "A0" || size === "A1" || size === "A2" || size === "A3" || size === "A4";
}

function constrainDimensions({ width, height }: Dimensions): Dimensions {
  const factor = Math.min(
    1,
    MAX_CANVAS_EDGE / width,
    MAX_CANVAS_EDGE / height,
    Math.sqrt(MAX_CANVAS_PIXELS / (width * height))
  );

  return {
    width: Math.max(1, Math.round(width * factor)),
    height: Math.max(1, Math.round(height * factor)),
  };
}

function getPaperPixelDimensions(size: PaperKey, isLandscape: boolean): Dimensions {
  const paper = PAPER_MM[size];
  const widthMm = isLandscape ? paper.h : paper.w;
  const heightMm = isLandscape ? paper.w : paper.h;

  return constrainDimensions({
    width: (widthMm / 25.4) * PRINT_DPI,
    height: (heightMm / 25.4) * PRINT_DPI,
  });
}

function getRenderBounds(
  size: DownloadSize,
  sourceWidth: number,
  sourceHeight: number
): Dimensions {
  if (isPaperSize(size)) {
    return getPaperPixelDimensions(size, sourceWidth >= sourceHeight);
  }

  const longEdge = size === "high" ? HIGH_RES_LONG_EDGE : ORIGINAL_LONG_EDGE;
  return { width: longEdge, height: longEdge };
}

function syncFormValues(source: HTMLElement, clone: HTMLElement) {
  const sourceFields = source.querySelectorAll("input, textarea, select");
  const clonedFields = clone.querySelectorAll("input, textarea, select");

  sourceFields.forEach((sourceField, index) => {
    const clonedField = clonedFields[index];
    if (!clonedField) return;

    if (sourceField instanceof HTMLInputElement && clonedField instanceof HTMLInputElement) {
      clonedField.value = sourceField.value;
      clonedField.checked = sourceField.checked;
    } else if (
      sourceField instanceof HTMLTextAreaElement &&
      clonedField instanceof HTMLTextAreaElement
    ) {
      clonedField.value = sourceField.value;
      clonedField.textContent = sourceField.value;
    } else if (
      sourceField instanceof HTMLSelectElement &&
      clonedField instanceof HTMLSelectElement
    ) {
      clonedField.value = sourceField.value;
    }
  });
}

function prepareClone(source: HTMLElement): { wrapper: HTMLDivElement; clone: HTMLElement } {
  const wrapper = document.createElement("div");
  wrapper.style.position = "fixed";
  wrapper.style.left = "0";
  wrapper.style.top = "0";
  wrapper.style.background = "#ffffff";
  wrapper.style.pointerEvents = "none";
  wrapper.style.zIndex = "-2147483648";

  const clone = source.cloneNode(true) as HTMLElement;
  clone.style.transform = "none";
  clone.style.margin = "0";
  clone.style.animation = "none";
  clone.style.transition = "none";
  clone.style.caretColor = "transparent";

  clone.querySelectorAll<HTMLElement>("*").forEach((element) => {
    element.style.animation = "none";
    element.style.transition = "none";
    element.style.caretColor = "transparent";
  });

  syncFormValues(source, clone);
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  return { wrapper, clone };
}

async function renderHighResolution(
  clone: HTMLElement,
  sourceWidth: number,
  sourceHeight: number,
  bounds: Dimensions
): Promise<HTMLCanvasElement> {
  const scale = Math.min(bounds.width / sourceWidth, bounds.height / sourceHeight);

  const options = {
    backgroundColor: "#ffffff",
    // Lad browseren tegne teksten samlet. Standard-rendereren opdeler tekst i
    // ord og kan derfor forskyde mellemrum ved de store eksportskaleringer.
    foreignObjectRendering: true,
    height: sourceHeight,
    logging: false,
    scale,
    useCORS: true,
    width: sourceWidth,
    windowHeight: Math.max(document.documentElement.clientHeight, sourceHeight),
    windowWidth: Math.max(document.documentElement.clientWidth, sourceWidth),
  };

  return html2canvas(clone, options);
}

function makePaperFrame(
  contentCanvas: HTMLCanvasElement,
  size: PaperKey
): HTMLCanvasElement {
  const frameSize = getPaperPixelDimensions(
    size,
    contentCanvas.width >= contentCanvas.height
  );
  const frame = document.createElement("canvas");
  frame.width = frameSize.width;
  frame.height = frameSize.height;

  const ctx = frame.getContext("2d");
  if (!ctx) return contentCanvas;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, frame.width, frame.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(contentCanvas, 0, 0);

  return frame;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Kunne ikke oprette PNG-data fra eksporten."));
      }
    }, "image/png");
  });
}

function exportToPdf(contentCanvas: HTMLCanvasElement, opts: DownloadOptions) {
  const isLandscape = contentCanvas.width >= contentCanvas.height;
  let pdf: jsPDF;
  let pageW: number;
  let pageH: number;

  if (isPaperSize(opts.size)) {
    pdf = new jsPDF({
      orientation: isLandscape ? "l" : "p",
      unit: "mm",
      format: opts.size.toLowerCase(),
    });
    pageW = pdf.internal.pageSize.getWidth();
    pageH = pdf.internal.pageSize.getHeight();
  } else {
    const imgAspect = contentCanvas.width / contentCanvas.height;
    const longSideMm = 420;
    pageW = isLandscape ? longSideMm : longSideMm * imgAspect;
    pageH = isLandscape ? longSideMm / imgAspect : longSideMm;

    pdf = new jsPDF({
      orientation: isLandscape ? "l" : "p",
      unit: "mm",
      format: [pageW, pageH],
    });
  }

  const margin = 5;
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2;
  const imgAspect = contentCanvas.width / contentCanvas.height;
  const pageAspect = maxW / maxH;
  const renderW = imgAspect > pageAspect ? maxW : maxH * imgAspect;
  const renderH = imgAspect > pageAspect ? maxW / imgAspect : maxH;

  // PNG holder tekst og streggrafik skarp uden JPEG-artefakter.
  pdf.addImage(contentCanvas, "PNG", margin, margin, renderW, renderH, undefined, "FAST");
  pdf.save("dissk.pdf");
}

export async function exportDissk(
  root: HTMLElement | null,
  opts: DownloadOptions
) {
  if (!root) return;

  const { wrapper, clone } = prepareClone(root);

  try {
    await document.fonts?.ready;

    const sourceWidth = Math.ceil(Math.max(clone.scrollWidth, clone.offsetWidth));
    const sourceHeight = Math.ceil(Math.max(clone.scrollHeight, clone.offsetHeight));
    if (!sourceWidth || !sourceHeight) {
      throw new Error("Eksportområdet har ingen størrelse.");
    }

    const bounds = getRenderBounds(opts.size, sourceWidth, sourceHeight);
    const contentCanvas = await renderHighResolution(
      clone,
      sourceWidth,
      sourceHeight,
      bounds
    );

    if (opts.format === "pdf") {
      exportToPdf(contentCanvas, opts);
      return;
    }

    const finalCanvas = isPaperSize(opts.size)
      ? makePaperFrame(contentCanvas, opts.size)
      : contentCanvas;
    downloadBlob(await canvasToBlob(finalCanvas), "dissk.png");
  } catch (err) {
    console.error("[exportDissk] Failed to export:", err);
  } finally {
    wrapper.remove();
  }
}
