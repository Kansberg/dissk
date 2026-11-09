import type { DownloadBoxLayout } from "../components/DownloadModal";

/** Prepare an independent print layout. Never resize the live editor. */
export function applyExportBoxLayout(clone: HTMLElement, layout: DownloadBoxLayout): void {
  const boxes = [...clone.querySelectorAll<HTMLElement>("[data-export-row]")];
  clone.querySelectorAll("button, [data-html2canvas-ignore]").forEach((element) => element.remove());

  for (const box of boxes) {
    Object.assign(box.style, {
      height: "auto", minHeight: "48px", maxHeight: "none",
      alignSelf: "start", overflow: "visible", boxSizing: "border-box",
    });
    box.querySelectorAll<HTMLElement>(".ql-container, .ql-editor").forEach((element) => {
      Object.assign(element.style, {
        height: "auto", minHeight: "0", maxHeight: "none", overflow: "visible",
      });
    });
  }

  if (layout !== "uniform") return;

  // Measure every natural height before assigning any uniform heights.
  const heights = new Map<string, number>();
  for (const box of boxes) {
    const row = box.dataset.exportRow!;
    heights.set(row, Math.max(heights.get(row) || 0, Math.ceil(box.getBoundingClientRect().height)));
  }
  for (const box of boxes) box.style.height = `${heights.get(box.dataset.exportRow!)}px`;
}
