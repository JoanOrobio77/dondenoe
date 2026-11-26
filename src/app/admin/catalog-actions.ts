"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireOwner } from "@/lib/auth";

function text(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

export async function addFromMaster(formData: FormData) {
  const { supabase, business } = await requireAdmin();
  if (business.template !== "tienda") redirect("/admin");
  let items: unknown;
  try {
    items = JSON.parse(text(formData.get("items")));
  } catch {
    redirect("/admin/catalogo?error=Revisa%20los%20productos%20elegidos.");
  }
  const { data, error } = await supabase.rpc("add_products_from_master", {
    p_business_id: business.id,
    p_items: items,
  });
  if (error) {
    const message = error.message.replace(/^ERROR:\s*/i, "");
    console.error(error.message);
    const safe = [
      "No autorizado",
      "Elige entre 1 y 100 productos",
      "Revisa el precio y el stock",
      "La categoría no es de esta tienda",
      "Ese producto del catálogo no está disponible",
      "Costo o stock mínimo inválido",
    ];
    redirect(`/admin/catalogo?error=${encodeURIComponent(safe.includes(message) ? message : "No se pudieron guardar los productos.")}`);
  }
  updateTag(`catalog:${business.slug}`);
  refresh();
  const skipped = Array.isArray(data?.omitidos) ? data.omitidos.length : 0;
  const created = Number(data?.creados ?? 0);
  const notice = skipped
    ? `Se agregaron ${created}. ${skipped} ya estaban en la tienda y no se duplicaron.`
    : `Se agregaron ${created} productos.`;
  redirect(`/admin/catalogo?ok=${encodeURIComponent(notice)}`);
}

export async function updateSaleMargin(formData: FormData) {
  const { supabase, business } = await requireOwner();
  const margin = Math.trunc(Number(formData.get("margin")));
  if (!Number.isInteger(margin) || margin < 0 || margin > 500) {
    redirect("/admin/catalogo?error=El%20margen%20debe%20estar%20entre%200%20y%20500.");
  }
  const { error } = await supabase.from("business_settings").update({ sale_margin_percent: margin }).eq("business_id", business.id);
  if (error) redirect("/admin/catalogo?error=No%20se%20pudo%20guardar%20el%20margen.");
  refresh();
  redirect("/admin/catalogo?ok=Margen%20guardado.");
}
