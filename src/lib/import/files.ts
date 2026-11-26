export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_PAGES = 5;
export const MAX_IMPORT_ROWS = 200;

export type ImportKind = "csv" | "xlsx" | "image" | "pdf";

function sliceText(bytes: Uint8Array, start: number, end: number) {
  return Buffer.from(bytes.subarray(start, end)).toString("latin1");
}

export function countPdfPages(bytes: Uint8Array) {
  const text = Buffer.from(bytes).toString("latin1");
  return text.match(/\/Type\s*\/Page(?!s)/g)?.length ?? 0;
}

function looksLikeCsv(bytes: Uint8Array, filename: string) {
  if (!filename.toLowerCase().endsWith(".csv")) return false;
  const sample = bytes.subarray(0, Math.min(bytes.length, 4096));
  if (sample.includes(0)) return false;
  const text = Buffer.from(sample).toString("utf8");
  return /[,;\t]/.test(text) && !text.includes("\u0000");
}

export function detectImport(bytes: Uint8Array, filename: string): { kind: ImportKind; mime: string } | { error: string } {
  if (bytes.length === 0) return { error: "El archivo está vacío." };
  if (bytes.length > MAX_IMPORT_BYTES) return { error: "El archivo pesa más de 10 MB." };
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { kind: "image", mime: "image/jpeg" };
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { kind: "image", mime: "image/png" };
  }
  if (bytes.length > 12 && sliceText(bytes, 0, 4) === "RIFF" && sliceText(bytes, 8, 12) === "WEBP") {
    return { kind: "image", mime: "image/webp" };
  }
  if (sliceText(bytes, 0, 5) === "%PDF-") {
    const pages = countPdfPages(bytes);
    if (pages < 1) return { error: "No pude leer las páginas del PDF." };
    if (pages > MAX_PDF_PAGES) return { error: "El PDF no puede tener más de 5 páginas." };
    return { kind: "pdf", mime: "application/pdf" };
  }
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    const packed = Buffer.from(bytes).toString("latin1");
    if (!packed.includes("xl/workbook")) return { error: "Ese archivo no es un Excel válido." };
    return { kind: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
  }
  if (looksLikeCsv(bytes, filename)) return { kind: "csv", mime: "text/csv" };
  return { error: "Usa un Excel, un CSV, una imagen JPG, PNG o WebP, o un PDF." };
}
