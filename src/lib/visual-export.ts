export function escapeXml(value: string | number) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function triggerDownload(url: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function downloadSvg(svg: string, filename: string) {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename.endsWith(".svg") ? filename : `${filename}.svg`);
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

export function downloadSvgAsPng(svg: string, filename: string, width = 1080, height = 1350) {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      URL.revokeObjectURL(url);
      return;
    }
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    canvas.toBlob((png) => {
      if (!png) return;
      const pngUrl = URL.createObjectURL(png);
      triggerDownload(pngUrl, filename.endsWith(".png") ? filename : `${filename}.png`);
      window.setTimeout(() => URL.revokeObjectURL(pngUrl), 500);
    }, "image/png");
    URL.revokeObjectURL(url);
  };
  image.src = url;
}

export function printSvg(svg: string, title: string) {
  const printWindow = window.open("", "_blank", "noopener,noreferrer");
  if (!printWindow) return;
  printWindow.document.write(`<!doctype html><html><head><title>${escapeXml(title)}</title><style>html,body{margin:0;background:#fff}svg{display:block;width:100%;height:auto}@media print{@page{size:letter portrait;margin:.2in}}</style></head><body>${svg}<script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></body></html>`);
  printWindow.document.close();
}
