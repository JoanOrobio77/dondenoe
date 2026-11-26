"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth";
import { parseCsv } from "@/lib/import/csv";
import { MASTER_KINDS } from "@/lib/import/kinds";

const KINDS = new Set(MASTER_KINDS.map(([value]) => value));

function text(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function back(message: string): never {
  redirect(`/plataforma/catalogo?error=${encodeURIComponent(message)}`);
}

export async function saveMasterProduct(formData: FormData) {
  const { supabase } = await requirePlatformAdmin();
  const id = text(formData.get("id"));
  const name = text(formData.get("name"));
  const brand = text(formData.get("brand"));
  const kind = text(formData.get("kind"));
  const presentation = text(formData.get("presentation"));
  const volume = text(formData.get("volume"));
  const units = Math.trunc(Number(formData.get("units") || 1));
  const barcode = text(formData.get("barcode"));
  const aliases = text(formData.get("aliases"))
    .split(",")
    .map((alias) => alias.trim())
    .filter(Boolean);
  if (name.length < 1 || name.length > 120 || brand.length < 1 || presentation.length < 1) back("Revisa nombre, marca y presentación.");
  if (!KINDS.has(kind as (typeof MASTER_KINDS)[number][0])) back("Elige un tipo.");
  if (!Number.isInteger(units) || units < 1) back("Las unidades por empaque deben ser al menos 1.");
  const row = {
    name,
    brand,
    kind,
    presentation,
    volume_ml: volume ? Number(volume) : null,
    units_per_pack: units,
    barcode: barcode || null,
    aliases,
    active: formData.get("active") === "on",
    draft: formData.get("draft") === "on",
    niche: "estanco",
  };
  const { error } = id
    ? await supabase.from("master_products").update(row).eq("id", id)
    : await supabase.from("master_products").insert(row);
  if (error) {
    console.error(error.message);
    back("No se pudo guardar el producto del catálogo.");
  }
  refresh();
  redirect("/plataforma/catalogo?ok=1");
}

export async function uploadMasterPhoto(formData: FormData) {
  const { supabase } = await requirePlatformAdmin();
  const id = text(formData.get("id"));
  const file = formData.get("photo");
  if (!id || !(file instanceof File) || file.size === 0) back("Elige una foto.");
  if (file.size > 2_097_152) back("La foto pesa más de 2 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = bytes[0] === 0xff ? "image/jpeg" : bytes[0] === 0x89 ? "image/png" : bytes[8] === 87 ? "image/webp" : "";
  const ext = mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "";
  if (!ext) back("La foto debe ser JPG, PNG o WebP.");
  const path = `${id}.${ext}`;
  const { error } = await supabase.storage.from("master").upload(path, bytes, { upsert: true, contentType: mime });
  if (error) back("No se pudo subir la foto.");
  const { data } = supabase.storage.from("master").getPublicUrl(path);
  const { error: updateError } = await supabase.from("master_products").update({ image_url: data.publicUrl }).eq("id", id);
  if (updateError) back("No se pudo guardar la foto.");
  refresh();
  redirect("/plataforma/catalogo?ok=1");
}

export async function importMasterCsv(formData: FormData) {
  const { supabase } = await requirePlatformAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) back("Elige un CSV.");
  if (file.size > 2_097_152) back("El CSV pesa más de 2 MB.");
  const rows = parseCsv(await file.text()).slice(1);
  let saved = 0;
  for (const row of rows) {
    const [name, brand, kind, presentation, volume, units, aliases] = row;
    if (!name || !brand || !presentation || !KINDS.has((kind ?? "") as (typeof MASTER_KINDS)[number][0])) continue;
    const { error } = await supabase.from("master_products").insert({
      name,
      brand,
      kind,
      presentation,
      volume_ml: volume ? Number(volume) : null,
      units_per_pack: Math.max(1, Math.trunc(Number(units) || 1)),
      aliases: (aliases ?? "").split("|").map((alias) => alias.trim()).filter(Boolean),
      draft: true,
      active: true,
      niche: "estanco",
    });
    if (!error) saved += 1;
  }
  refresh();
  redirect(`/plataforma/catalogo?ok=${saved}`);
}

export async function updateAiLimits(formData: FormData) {
  const { supabase } = await requirePlatformAdmin();
  const basico = Math.trunc(Number(formData.get("basico")));
  const completo = Math.trunc(Number(formData.get("completo")));
  if (![basico, completo].every((value) => Number.isInteger(value) && value >= 0 && value <= 100)) {
    back("El límite diario debe estar entre 0 y 100.");
  }
  const { error } = await supabase
    .from("platform_settings")
    .update({ value: { basico, completo } })
    .eq("key", "ai_daily_reads");
  if (error) back("No se pudo guardar el límite.");
  refresh();
  redirect("/plataforma/catalogo?ok=1");
}
