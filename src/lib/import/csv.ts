import * as XLSX from "xlsx";
import { MAX_IMPORT_ROWS } from "./files";

function splitRow(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

export function parseCsv(text: string) {
  const cleaned = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = cleaned.split("\n").filter((line) => line.trim().length > 0).slice(0, MAX_IMPORT_ROWS + 1);
  const header = lines[0] ?? "";
  const delimiter = header.split(";").length > header.split(",").length ? ";" : ",";
  return lines.map((line) => splitRow(line, delimiter));
}

export function parseXlsx(bytes: Uint8Array) {
  try {
    const book = XLSX.read(bytes, {
      type: "array",
      sheets: 0,
      sheetRows: MAX_IMPORT_ROWS,
      cellFormula: false,
      cellHTML: false,
      cellNF: false,
      cellStyles: false,
      cellDates: false,
      bookVBA: false,
      bookDeps: false,
      bookFiles: false,
    });
    const name = book.SheetNames[0];
    if (!name) return [];
    const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(book.Sheets[name], {
      header: 1,
      raw: false,
      defval: "",
    });
    return rows.slice(0, MAX_IMPORT_ROWS).map((row) => row.map((cell) => String(cell ?? "").trim()));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("No se pudo leer")) throw error;
    throw new Error("No se pudo leer el Excel. Revisa que sea un archivo válido.");
  }
}

export function applyColumnMap(
  rows: string[][],
  mapping: { name: number; presentation: number; cost: number; price: number; stock: number; barcode: number },
) {
  const body = rows.slice(1);
  return body
    .map((row) => ({
      nombre: row[mapping.name] ?? "",
      presentacion: mapping.presentation >= 0 ? row[mapping.presentation] || null : null,
      costo: mapping.cost >= 0 ? numberOrNull(row[mapping.cost]) : null,
      precio: mapping.price >= 0 ? numberOrNull(row[mapping.price]) : null,
      cantidad: mapping.stock >= 0 ? numberOrNull(row[mapping.stock]) : null,
      codigo_barras: mapping.barcode >= 0 ? row[mapping.barcode] || null : null,
    }))
    .filter((row) => row.nombre.length > 0);
}

function numberOrNull(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}
