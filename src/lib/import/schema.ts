import { z } from "zod";

export const aiLineSchema = z.object({
  nombre: z.string().trim().min(1).max(120),
  presentacion: z.string().trim().max(80).nullish(),
  cantidad: z.number().nonnegative().max(100000).nullish(),
  precio_unitario: z.number().nonnegative().max(100_000_000).nullish(),
  tipo_precio: z.enum(["compra", "venta"]).nullish(),
  codigo_barras: z.string().trim().max(32).nullish(),
  confianza: z.number().min(0).max(1),
});

export const aiDocumentSchema = z.object({
  lineas: z.array(aiLineSchema).max(200),
});

export type AiLine = z.infer<typeof aiLineSchema>;
export type AiDocument = z.infer<typeof aiDocumentSchema>;

export function parseAiDocument(raw: unknown): { ok: true; data: AiDocument } | { ok: false; error: string } {
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    const parsed = aiDocumentSchema.safeParse(value);
    if (!parsed.success) return { ok: false, error: "La respuesta no tiene la forma esperada." };
    return { ok: true, data: parsed.data };
  } catch {
    return { ok: false, error: "La respuesta no es JSON." };
  }
}

export async function acceptAiDocument(read: () => Promise<unknown>): Promise<AiDocument> {
  const first = parseAiDocument(await read());
  if (first.ok) return first.data;
  const second = parseAiDocument(await read());
  if (second.ok) return second.data;
  throw new Error("La lectura no devolvió una lista válida. Intenta con otra foto o usa Excel.");
}
