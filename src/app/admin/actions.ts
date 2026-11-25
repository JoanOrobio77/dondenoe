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
