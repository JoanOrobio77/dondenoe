"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { aiConfigured, extractPriceLines } from "@/lib/ai/client";
import { applyColumnMap, parseCsv, parseXlsx } from "@/lib/import/csv";
import { detectImport } from "@/lib/import/files";
import { chooseSuggestion } from "@/lib/import/match";
import { suggestSalePrice } from "@/lib/import/price";
import type { AiLine } from "@/lib/import/schema";

function text(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

async function shop() {
  const session = await requireAdmin();
  if (session.business.template !== "tienda") redirect("/admin");
  return session;
}

type DraftLine = {
  nombre: string;
  presentacion: string | null;
  cantidad: number | null;
  precio_unitario: number | null;
  tipo_precio: "compra" | "venta" | null;
  codigo_barras: string | null;
  confianza: number | null;
  costo: number | null;
  master_product_id: string | null;
  master_name: string | null;
  score: number | null;
  product_id: string | null;
  product_name: string | null;
  action: "crear" | "vincular" | "actualizar" | "omitir";
};

async function enrich(
  supabase: Awaited<ReturnType<typeof shop>>["supabase"],
  businessId: string,
  lines: Omit<DraftLine, "master_product_id" | "master_name" | "score" | "product_id" | "product_name" | "action">[],
  owner: boolean,
  margin: number,
) {
  const { data } = await supabase.rpc("match_catalog_lines", {
    p_business_id: businessId,
    p_lines: lines.map((line) => ({ nombre: line.nombre, codigo_barras: line.codigo_barras })),
  });
  const matches = (data ?? []) as {
    idx: number;
    master_product_id: string | null;
    master_name: string | null;
    score: number | null;
    product_id: string | null;
    product_name: string | null;
  }[];
  return lines.map((line, index) => {
    const match = matches.find((item) => item.idx === index);
    const suggestion = chooseSuggestion(
      match?.product_id ? { id: match.product_id, name: match.product_name ?? "" } : null,
      match?.master_product_id
        ? { id: match.master_product_id, name: match.master_name ?? "", score: Number(match.score ?? 0) }
        : null,
    );
    const purchase = line.tipo_precio === "compra" ? line.precio_unitario : line.costo;
    const sale =
      line.tipo_precio === "venta" && line.precio_unitario
        ? Math.round(line.precio_unitario)
        : owner && purchase
          ? suggestSalePrice(purchase, margin)
          : 0;
    const stored: DraftLine = {
      ...line,
      precio_unitario: sale || null,
      costo: owner && purchase ? Math.round(purchase) : null,
      master_product_id: suggestion.masterId,
      master_name: match?.master_name ?? null,
      score: match?.score === null || match?.score === undefined ? null : Number(match.score),
      product_id: suggestion.productId,
      product_name: match?.product_name ?? null,
      action: suggestion.action,
    };
    return stored;
  });
}

export async function startImport(formData: FormData) {
  const { supabase, business, owner } = await shop();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) fail("/admin/importar", "Elige un archivo.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = detectImport(bytes, file.name);
  if ("error" in detected) fail("/admin/importar", detected.error);

  if ((detected.kind === "image" || detected.kind === "pdf") && !aiConfigured()) {
    fail("/admin/importar", "La lectura con IA no está configurada. Puedes importar un Excel o un CSV.");
  }
  if (detected.kind === "image" || detected.kind === "pdf") {
    const [{ data: used }, { data: limit }] = await Promise.all([
      supabase.rpc("ai_reads_today", { p_business_id: business.id }),
      supabase.rpc("ai_daily_limit", { p_business_id: business.id }),
    ]);
    if (Number(used ?? 0) >= Number(limit ?? 10)) {
      fail("/admin/importar", "Llegaste al límite de lecturas con IA de hoy.");
    }
  }

  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) fail("/admin/importar", "Entra de nuevo al panel.");
  const id = crypto.randomUUID();
  const extension = detected.kind === "xlsx" ? "xlsx" : detected.kind === "pdf" ? "pdf" : detected.kind === "csv" ? "csv" : "img";
  const path = `${business.id}/imports/${id}.${extension}`;
  const { error: jobError } = await supabase.from("import_jobs").insert({
    id,
    business_id: business.id,
    user_id: userId,
    kind: detected.kind,
    status: "revisando",
    file_path: path,
  });
  if (jobError) fail("/admin/importar", "No se pudo abrir la importación.");
  const { error: uploadError } = await supabase.storage.from("imports").upload(path, bytes, { contentType: detected.mime });
  if (uploadError) {
    await supabase.from("import_jobs").update({ status: "fallido" }).eq("id", id);
    fail("/admin/importar", "No se pudo guardar el archivo.");
  }

  const { data: settings } = await supabase
    .from("business_settings")
    .select("sale_margin_percent")
    .eq("business_id", business.id)
    .maybeSingle();
  const margin = settings?.sale_margin_percent ?? 30;

  if (detected.kind === "csv" || detected.kind === "xlsx") {
    let rows: string[][];
    try {
      rows = detected.kind === "csv" ? parseCsv(Buffer.from(bytes).toString("utf8")) : parseXlsx(bytes);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo leer el archivo.";
      await supabase.from("import_jobs").update({ status: "fallido" }).eq("id", id);
      fail("/admin/importar", message);
    }
    await supabase.from("import_jobs").update({ result: { headers: rows[0] ?? [], rows: rows.slice(0, 8), all: rows } }).eq("id", id);
    redirect(`/admin/importar/${id}`);
  }

  try {
    const extracted = await extractPriceLines({ bytes, mime: detected.mime });
    await supabase.rpc("record_ai_usage", { p_business_id: business.id, p_units: extracted.calls });
    const lineas = await enrich(
      supabase,
      business.id,
      extracted.document.lineas.map(toDraft),
      owner,
      margin,
    );
    await supabase.from("import_jobs").update({ result: { lineas } }).eq("id", id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo leer el documento.";
    await supabase.from("import_jobs").update({ status: "fallido" }).eq("id", id);
    fail("/admin/importar", message);
  }
  redirect(`/admin/importar/${id}`);
}

function toDraft(line: AiLine) {
  return {
    nombre: line.nombre,
    presentacion: line.presentacion ?? null,
    cantidad: line.cantidad ?? null,
    precio_unitario: line.precio_unitario ?? null,
    tipo_precio: line.tipo_precio ?? null,
    codigo_barras: line.codigo_barras ?? null,
    confianza: line.confianza,
    costo: line.tipo_precio === "compra" ? line.precio_unitario ?? null : null,
  };
}

export async function mapImportColumns(formData: FormData) {
  const { supabase, business, owner } = await shop();
  const id = text(formData.get("id"));
  const { data: job } = await supabase.from("import_jobs").select("id, result").eq("id", id).eq("business_id", business.id).maybeSingle();
  const all = (job?.result as { all?: string[][] } | null)?.all;
  if (!all) fail("/admin/importar", "No encontramos esa importación.");
  const mapping = {
    name: Number(formData.get("name")),
    presentation: Number(formData.get("presentation")),
    cost: owner ? Number(formData.get("cost")) : -1,
    price: Number(formData.get("price")),
    stock: Number(formData.get("stock")),
    barcode: Number(formData.get("barcode")),
  };
  if (!Number.isInteger(mapping.name) || mapping.name < 0) fail(`/admin/importar/${id}`, "Indica cuál columna es el nombre.");
  const mapped = applyColumnMap(all, mapping);
  const { data: settings } = await supabase.from("business_settings").select("sale_margin_percent").eq("business_id", business.id).maybeSingle();
  const lineas = await enrich(
    supabase,
    business.id,
    mapped.map((row) => ({
      nombre: row.nombre,
      presentacion: row.presentacion,
      cantidad: row.cantidad,
      precio_unitario: row.precio ?? row.costo,
      tipo_precio: row.costo !== null && row.precio === null ? "compra" : row.precio !== null ? "venta" : null,
      codigo_barras: row.codigo_barras,
      confianza: 1,
      costo: row.costo,
    })),
    owner,
    settings?.sale_margin_percent ?? 30,
  );
  await supabase.from("import_jobs").update({ result: { lineas } }).eq("id", id).eq("business_id", business.id);
  refresh();
  redirect(`/admin/importar/${id}`);
}

export async function confirmImport(formData: FormData) {
  const { supabase, business, owner } = await shop();
  const id = text(formData.get("id"));
  let lines: {
    action: string;
    name: string;
    presentation?: string;
    master_product_id?: string | null;
    product_id?: string | null;
    category_id?: number | null;
    price?: number;
    cost?: number | null;
    quantity?: number;
    barcode?: string | null;
  }[];
  try {
    lines = JSON.parse(text(formData.get("lines")));
  } catch {
    fail(`/admin/importar/${id}`, "Revisa la tabla antes de guardar.");
  }
  const payload = lines.map((line) => ({
    action: line.action,
    name: line.name,
    presentation: line.presentation ?? "",
    master_product_id: line.master_product_id || null,
    product_id: line.product_id || null,
    category_id: line.category_id || null,
    price: line.price,
    quantity: line.quantity ?? 0,
    barcode: line.barcode || "",
    ...(owner ? { cost: line.cost ?? null } : {}),
  }));
  const { error } = await supabase.rpc("confirm_catalog_import", {
    p_business_id: business.id,
    p_lines: payload,
  });
  if (error) {
    const message = error.message.replace(/^ERROR:\s*/i, "");
    console.error(error.message);
    fail(`/admin/importar/${id}`, message || "No se guardó ninguna línea.");
  }
  await supabase.from("import_jobs").update({ status: "confirmado" }).eq("id", id).eq("business_id", business.id);
  updateTag(`catalog:${business.slug}`);
  refresh();
  redirect("/admin/importar?ok=1");
}
