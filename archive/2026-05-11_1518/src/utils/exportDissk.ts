import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import type { DownloadOptions } from "../components/DownloadModal";

// A-formater i mm (PORTRÆT)
const PAPER_MM = {
  A0: { w: 841, h: 1189 },
  A1: { w: 594, h: 841 },
  A2: { w: 420, h: 594 },
  A3: { w: 297, h: 420 },
  A4: { w: 210, h: 297 },
} as const;

// Mål-højder i pixels (styrer skarphed / "lange kant")
const TARGET_HEIGHTS = {
  A4: 2600,
  A3: 3400,
  A2: 4200,
  A1: 5200,
  A0: 6200,
  ORIGINAL: 5000,
  HIGH: 8000,
} as const;

type SizeKey = keyof typeof TARGET_HEIGHTS;
type PaperKey = keyof typeof PAPER_MM;

function getSizeKey(size: string): SizeKey {
  switch (size) {
    case "A0":
      return "A0";
    case "A1":
      return "A1";
    case "A2":
      return "A2";
    case "A3":
      return "A3";
    case "A4":
      return "A4";
    case "Original (100%)":
      return "ORIGINAL";
    case "Høj opløsning (5000px)":
      return "HIGH";
    case "Anbefalet":
    default:
      return "A3";
  }
}

function pickPaper(size: string): PaperKey {
  switch (size) {
    case "A0":
      return "A0";
    case "A1":
      return "A1";
    case "A2":
      return "A2";
    case "A3":
      return "A3";
    case "A4":
      return "A4";
    case "Original (100%)":
    case "Høj opløsning (5000px)":
    case "Anbefalet":
    default:
      return "A3";
  }
}

function isAFormat(size: string): boolean {
  return size === "A0" || size === "A1" || size === "A2" || size === "A3" || size === "A4";
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Lav et ekstra canvas i "ægte A-format"-aspect-ratio (i pixels) og
 * placer modellen oppe i venstre hjørne (top-left) uden at strække den.
 * Bruges KUN til A0–A4. Original/High bruger det rene canvas-aspect.
 */
function makeAFormatFrameForPng(
  scaledCanvas: HTMLCanvasElement,
  sizeLabel: string,
  targetHeight: number
): HTMLCanvasElement {
  const paperKey = pickPaper(sizeLabel);
  const paper = PAPER_MM[paperKey];

  const isLandscape = scaledCanvas.width >= scaledCanvas.height;

  // PORTRÆT-forholdet (w<h)
  const portraitRatio = paper.w / paper.h; // ~0.707 for A-serien
  // Rigtige width/height-ratio for den valgte orientering
  const pageRatio = isLandscape ? 1 / portraitRatio : portraitRatio; // w/h

  // Vi bruger targetHeight som "lange kant" i pixels
  const longEdgePx = targetHeight;
  let finalW: number;
  let finalH: number;

  if (isLandscape) {
    finalW = longEdgePx;
    finalH = longEdgePx / pageRatio;
  } else {
    finalH = longEdgePx;
    finalW = longEdgePx * pageRatio;
  }

  const frame = document.createElement("canvas");
  frame.width = Math.round(finalW);
  frame.height = Math.round(finalH);

  const ctx = frame.getContext("2d");
  if (!ctx) return scaledCanvas;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, frame.width, frame.height);

  // Skaler modellen så den fylder A-rammen mest muligt uden distortion
  const scaleToFit = Math.min(
    frame.width / scaledCanvas.width,
    frame.height / scaledCanvas.height
  );

  const renderW = scaledCanvas.width * scaleToFit;
  const renderH = scaledCanvas.height * scaleToFit;

  // ⬇️ Top-left: ingen centrering, bare (0,0)
  const offsetX = 0;
  const offsetY = 0;

  ctx.drawImage(
    scaledCanvas,
    0,
    0,
    scaledCanvas.width,
    scaledCanvas.height,
    offsetX,
    offsetY,
    renderW,
    renderH
  );

  return frame;
}

/**
 * Eksporter til PDF – bruger jsPDFs egen side-størrelse og placerer billedet
 * oppe i venstre hjørne (top-left) med en lille margin.
 */
function exportToPdf(scaledCanvas: HTMLCanvasElement, opts: DownloadOptions) {
  const isLandscape = scaledCanvas.width >= scaledCanvas.height;
  const useAFormat = isAFormat(opts.size);

  let pdf: jsPDF;
  let pageW: number;
  let pageH: number;

  if (useAFormat) {
    // ✅ A0–A4: brug rigtige A-formater
    const aFormat = pickPaper(opts.size);

    pdf = new jsPDF({
      orientation: isLandscape ? "l" : "p",
      unit: "mm",
      format: aFormat.toLowerCase() as any,
    });

    pageW = pdf.internal.pageSize.getWidth();
    pageH = pdf.internal.pageSize.getHeight();
  } else {
    // ✅ Original / Høj opløsning:
    // Lav en side der matcher BILLEDETs aspect-ratio
    const imgAspect = scaledCanvas.width / scaledCanvas.height; // w/h

    // Vælg en "fornuftig" lang side i mm (ca. A3-højde)
    const longSideMm = 420;

    if (isLandscape) {
      pageW = longSideMm;
      pageH = longSideMm / imgAspect;
    } else {
      pageH = longSideMm;
      pageW = longSideMm * imgAspect;
    }

    pdf = new jsPDF({
      orientation: isLandscape ? "l" : "p",
      unit: "mm",
      format: [pageW, pageH] as [number, number],
    });
  }

  const margin = 5; // lille hvid kant
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2;

  const imgAspect = scaledCanvas.width / scaledCanvas.height;
  const pageAspect = maxW / maxH;

  let renderW: number;
  let renderH: number;

  if (imgAspect > pageAspect) {
    // begrænset af bredde
    renderW = maxW;
    renderH = renderW / imgAspect;
  } else {
    // begrænset af højde
    renderH = maxH;
    renderW = renderH * imgAspect;
  }

  // ⬇️ Top-left (lille margin hele vejen)
  const x = margin;
  const y = margin;

  const imgData = scaledCanvas.toDataURL("image/jpeg", 0.9);
  pdf.addImage(imgData, "JPEG", x, y, renderW, renderH);
  pdf.save("dissk.pdf");
}


export async function exportDissk(
  root: HTMLElement | null,
  opts: DownloadOptions
) {
  if (!root) return;

  try {
    // 1) Usynlig klon af DOM'en (så vi ikke får scrollbars, zoom osv. med)
    const wrapper = document.createElement("div");
    wrapper.style.position = "fixed";
    wrapper.style.left = "-100000px";
    wrapper.style.top = "0";
    wrapper.style.background = "#ffffff";

    const clone = root.cloneNode(true) as HTMLElement;
    wrapper.appendChild(clone);
    document.body.appendChild(wrapper);

    // 2) Render DOM til canvas
    const baseCanvas = await html2canvas(clone, {
      background: "#ffffff",
      useCORS: true,
      logging: false,
    });

    document.body.removeChild(wrapper);

    // 3) Skaler til ønsket "mål-højde" for skarphed
    const sizeKey = getSizeKey(opts.size);
    const targetHeight = TARGET_HEIGHTS[sizeKey];

    const scale = targetHeight / baseCanvas.height;
    const scaledCanvas = document.createElement("canvas");
    scaledCanvas.width = Math.round(baseCanvas.width * scale);
    scaledCanvas.height = Math.round(baseCanvas.height * scale);

    const ctx = scaledCanvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, scaledCanvas.width, scaledCanvas.height);
    ctx.drawImage(
      baseCanvas,
      0,
      0,
      baseCanvas.width,
      baseCanvas.height,
      0,
      0,
      scaledCanvas.width,
      scaledCanvas.height
    );

    // 4) PNG
    if (opts.format === "png") {
      let finalCanvas: HTMLCanvasElement = scaledCanvas;

      // 👉 A-formater: læg i A-ramme (top-left)
      // 👉 Original / Høj opløsning: brug ren scaledCanvas (original aspect-ratio)
      if (isAFormat(opts.size)) {
        finalCanvas = makeAFormatFrameForPng(scaledCanvas, opts.size, targetHeight);
      }

      const pngData = finalCanvas.toDataURL("image/png");
      downloadDataUrl(pngData, "dissk.png");
      return;
    }

    // 5) PDF
    exportToPdf(scaledCanvas, opts);
  } catch (err) {
    console.error("[exportDissk] Failed to export:", err);
  }
}
