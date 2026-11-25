"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";

const NEXT_STATUS = {
  nuevo: ["confirmado", "cancelado"],
  confirmado: ["en_camino", "cancelado"],
  en_camino: ["entregado", "cancelado"],
} as const;

export async function signIn(_prev: string | null, formData: FormData) {
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });
  if (error) return "Correo o contraseña incorrectos.";
  redirect("/admin");
}

export async function signOut() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

export async function updateOrderStatus(formData: FormData) {
  const supabase = await requireAdmin();
  const orderId = String(formData.get("orderId"));
  const status = String(formData.get("status"));

  const { data: order } = await supabase.from("orders").select("status").eq("id", orderId).single();
  const allowed: readonly string[] = NEXT_STATUS[order?.status as keyof typeof NEXT_STATUS] ?? [];
  if (!allowed.includes(status)) throw new Error("Cambio de estado no permitido");

  await supabase
    .from("orders")
    .update({ status, ...(status === "entregado" && { age_verified_on_delivery: true }) })
    .eq("id", orderId)
    .throwOnError();

  if (status === "entregado") updateTag("catalog");
  refresh();
}

export async function registerMovement(formData: FormData) {
  const supabase = await requireAdmin();
  const quantity = Math.trunc(Number(formData.get("quantity")));
  const reason = String(formData.get("reason"));
  if (!quantity || !["entrada", "ajuste"].includes(reason)) return;

  await supabase
    .from("inventory_movements")
    .insert({
      product_id: String(formData.get("productId")),
      quantity: reason === "entrada" ? Math.abs(quantity) : quantity,
      reason,
      note: String(formData.get("note") ?? "") || null,
    })
    .throwOnError();

  updateTag("catalog");
  refresh();
}

function pesos(formData: FormData, name: string) {
  const value = Math.round(Number(formData.get(name)));
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

function bogotaTimestamp(value: FormDataEntryValue | null) {
  const text = String(value ?? "");
  if (!text) return null;
  const date = new Date(text.length === 16 ? `${text}:00-05:00` : text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function updateProduct(formData: FormData) {
  const supabase = await requireAdmin();
  const price = pesos(formData, "price");
  const cost = pesos(formData, "cost");
  const minStock = Math.trunc(Number(formData.get("minStock")));
  const name = String(formData.get("name") ?? "").trim();
  const categoryId = Number(formData.get("categoryId"));
  const description = formData.get("description");
  if (price === null || cost === null || !name || minStock < 0) throw new Error("Revisa el nombre, el precio y el costo");

  const productId = String(formData.get("productId"));
  await supabase
    .from("products")
    .update({
      name,
      price,
      active: formData.get("active") === "on",
      ...(categoryId ? { category_id: categoryId } : {}),
      ...(description !== null ? { description: String(description).trim() || null } : {}),
    })
    .eq("id", productId)
    .throwOnError();
  const { error: privateError } = await supabase.rpc("admin_set_product_private", {
    p_id: productId,
    p_cost: cost,
    p_min_stock: minStock,
  });
  if (privateError) throw new Error("No se pudo guardar el costo");
  updateTag("catalog");
  refresh();
}

const PHOTO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function photoMessage(message: string) {
  if (/bucket not found/i.test(message)) {
    return "Falta el depósito de fotos. En Supabase ejecuta supabase/migrations/003_fotos_productos.sql y vuelve a intentar.";
  }
  if (/row-level security|not authorized|unauthorized|403/i.test(message)) {
    return "Esta cuenta no puede subir fotos. Confirma que sea administradora y que ya corriste la migración 003.";
  }
  return "No se pudo guardar la foto. Prueba con otra imagen JPG o PNG.";
}

type PhotoResult = { ok: false; error: string } | { ok: true; url: string };

async function saveProductPhoto(
  supabase: Awaited<ReturnType<typeof requireAdmin>>,
  productId: string,
  file: File,
): Promise<PhotoResult> {
  const ext = PHOTO_EXT[file.type];
  if (!ext) return { ok: false, error: "La foto debe ser JPG, PNG o WebP." };
  if (file.size > 2_097_152) return { ok: false, error: "La foto pesa más de 2 MB. Elige otra o toma una más pequeña." };
  const path = `${productId}.${ext}`;
  const { error } = await supabase.storage.from("products").upload(path, file, {
    contentType: file.type,
    upsert: true,
  });
  if (error) return { ok: false, error: photoMessage(error.message) };
  await supabase.storage.from("products").remove(
    ["jpg", "png", "webp"].filter((item) => item !== ext).map((item) => `${productId}.${item}`),
  );
  const { data } = supabase.storage.from("products").getPublicUrl(path);
  return { ok: true, url: `${data.publicUrl}?v=${Date.now()}` };
}

type NewProductInput =
  | { ok: false; error: string }
  | {
      ok: true;
      name: string;
      categoryId: number;
      price: number;
      cost: number;
      stock: number;
      minStock: number;
      description: string;
      note: string;
      file: File | null;
    };

function readNewProduct(formData: FormData): NewProductInput {
  const price = pesos(formData, "price");
  const cost = pesos(formData, "cost");
  const name = String(formData.get("name") ?? "").trim();
  const categoryId = Number(formData.get("categoryId"));
  const stock = Math.trunc(Number(formData.get("stock") || 0));
  const minStock = Math.trunc(Number(formData.get("minStock") || 0));
  const description = String(formData.get("description") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const rawFile = formData.get("image");
  const file = rawFile instanceof File && rawFile.size > 0 ? rawFile : null;
  if (!name || name.length > 120) return { ok: false, error: "Escribe el nombre del producto." };
  if (!categoryId) return { ok: false, error: "Elige una categoría." };
  if (price === null || price <= 0) return { ok: false, error: "El precio de venta tiene que ser mayor que 0." };
  if (cost === null) return { ok: false, error: "Escribe el costo. Si todavía no lo sabes, pon 0." };
  if (!Number.isFinite(stock) || stock < 0 || !Number.isFinite(minStock) || minStock < 0) {
    return { ok: false, error: "El stock no puede ser negativo." };
  }
  if (description.length > 300) return { ok: false, error: "La descripción es demasiado larga." };
  if (file) {
    if (!PHOTO_EXT[file.type]) return { ok: false, error: "La foto debe ser JPG, PNG o WebP." };
    if (file.size > 2_097_152) return { ok: false, error: "La foto pesa más de 2 MB. Elige otra o toma una más pequeña." };
  }
  return { ok: true, name, categoryId, price, cost, stock, minStock, description, note, file };
}

export async function createProduct(_prev: string | null | undefined, formData: FormData): Promise<string | null> {
  const supabase = await requireAdmin();
  const input = readNewProduct(formData);
  if (!input.ok) return input.error;

  const { data: created, error } = await supabase
    .from("products")
    .insert({
      name: input.name,
      category_id: input.categoryId,
      description: input.description || null,
      price: input.price,
      stock: 0,
    })
    .select("id")
    .single();
  if (error || !created) return "No se pudo crear el producto. Entra de nuevo al panel e inténtalo otra vez.";

  const { error: privateError } = await supabase.rpc("admin_set_product_private", {
    p_id: created.id,
    p_cost: input.cost,
    p_min_stock: input.minStock,
  });
  if (privateError) {
    await supabase.from("products").delete().eq("id", created.id);
    return "No se pudo guardar el costo del producto.";
  }

  const discard = async () => {
    await supabase.storage.from("products").remove([`${created.id}.jpg`, `${created.id}.png`, `${created.id}.webp`]);
    await supabase.from("products").delete().eq("id", created.id);
  };

  if (input.file) {
    const uploaded = await saveProductPhoto(supabase, created.id, input.file);
    if (!uploaded.ok) {
      await discard();
      return uploaded.error;
    }
    const { error: imageError } = await supabase.from("products").update({ image_url: uploaded.url }).eq("id", created.id);
    if (imageError) {
      await discard();
      return "No se pudo guardar la foto del producto.";
    }
  }

  if (input.stock > 0) {
    const { error: moveError } = await supabase.from("inventory_movements").insert({
      product_id: created.id,
      quantity: input.stock,
      reason: "entrada",
      note: input.note || "Alta de producto",
    });
    if (moveError) {
      await discard();
      return "No se pudo registrar el stock inicial.";
    }
  }

  updateTag("catalog");
  refresh();
  return null;
}

export async function updateProductImage(_prev: string | null | undefined, formData: FormData): Promise<string | null> {
  const supabase = await requireAdmin();
  const productId = String(formData.get("productId") ?? "");
  const file = formData.get("image");
  if (!productId) return "No encontré el producto.";
  if (!(file instanceof File) || file.size === 0) return "Elige una foto.";

  const uploaded = await saveProductPhoto(supabase, productId, file);
  if (!uploaded.ok) return uploaded.error;

  const { error } = await supabase.from("products").update({ image_url: uploaded.url }).eq("id", productId);
  if (error) return "No se pudo guardar la foto del producto.";
  updateTag("catalog");
  refresh();
  return null;
}

export async function updateZone(formData: FormData) {
  const supabase = await requireAdmin();
  const fee = pesos(formData, "fee");
  const name = String(formData.get("name") ?? "").trim();
  if (fee === null || !name) throw new Error("La zona necesita nombre y tarifa");

  await supabase
    .from("delivery_zones")
    .update({ name, fee, active: formData.get("active") === "on" })
    .eq("id", Number(formData.get("zoneId")))
    .throwOnError();
  updateTag("catalog");
  refresh();
}

export async function createZone(formData: FormData) {
  const supabase = await requireAdmin();
  const fee = pesos(formData, "fee");
  const name = String(formData.get("name") ?? "").trim();
  if (fee === null || !name) throw new Error("La zona necesita nombre y tarifa");

  await supabase.from("delivery_zones").insert({ name, fee }).throwOnError();
  updateTag("catalog");
  refresh();
}

export async function savePromotion(formData: FormData) {
  const supabase = await requireAdmin();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) throw new Error("La promoción necesita un título");
  const discount = formData.get("discount") ? Math.round(Number(formData.get("discount"))) : null;
  if (discount !== null && (discount < 0 || discount > 100)) throw new Error("El descuento va de 0 a 100");

  await supabase
    .from("promotions")
    .insert({
      title,
      description: String(formData.get("description") ?? "").trim() || null,
      discount_percent: discount,
      ends_at: bogotaTimestamp(formData.get("endsAt")),
    })
    .throwOnError();
  updateTag("promotions");
  refresh();
}

export async function setPromotionActive(formData: FormData) {
  const supabase = await requireAdmin();
  await supabase
    .from("promotions")
    .update({ active: formData.get("active") === "true" })
    .eq("id", String(formData.get("promotionId")))
    .throwOnError();
  updateTag("promotions");
  refresh();
}
