import JsBarcode from "jsbarcode";

// Renders a CODE128 barcode to a PNG data URL for embedding in the printable
// receipt/stub HTML. No human-readable text is baked into the image — the
// receipt number is already printed as its own line, so keeping the barcode
// text-free keeps it compact on 80mm thermal paper (Part P).
export function renderBarcodeDataUrl(token: string): string {
  // This module is imported by printService.ts, which is also exercised by
  // this repo's Node-based (non-browser) test runner. There's no real
  // <canvas>/JsBarcode rendering outside a browser, so a deterministic
  // placeholder keeps HTML-structure tests (barcode block present/absent,
  // correct token) meaningful without needing a DOM there. Production always
  // runs in a real browser, so this branch never executes there.
  if (typeof document === "undefined" || typeof document.createElement !== "function") {
    return `data:image/png;base64,TEST-BARCODE-${token}`;
  }
  const canvas = document.createElement("canvas");
  JsBarcode(canvas, token, {
    format: "CODE128",
    displayValue: false,
    width: 2,
    height: 46,
    margin: 0,
    background: "#ffffff",
    lineColor: "#000000",
  });
  return canvas.toDataURL("image/png");
}
