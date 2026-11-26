import { cacheLife, cacheTag } from "next/cache";
import { demoCatalog } from "./demo-data";
import { loadStore, storeIsOpen } from "./store";
import { createPublicClient, isSupabaseConfigured } from "./supabase/public";
import type { Catalog } from "./types";

export type Promotion = {
  id: string;
  title: string;
  description: string | null;
  discountPercent: number | null;
};

export async function getPromotions(slug: string): Promise<Promotion[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`promotions:${slug}`);

  if (!isSupabaseConfigured()) return [];
  const store = await loadStore(slug);
  if (!store || !storeIsOpen(store.status)) return [];

  const { data } = await createPublicClient()
    .from("promotions")
    .select("id, title, description, discount_percent")
    .eq("business_id", store.id)
    .order("starts_at", { ascending: false })
    .throwOnError();

  return data.map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    discountPercent: p.discount_percent,
  }));
}

export async function getCatalog(slug: string): Promise<Catalog> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`catalog:${slug}`);

  if (!isSupabaseConfigured()) return demoCatalog;
  const store = await loadStore(slug);
  if (!store || !storeIsOpen(store.status)) {
    return { categories: [], products: [], combos: [], zones: [] };
  }

  const supabase = createPublicClient();
  const [categories, products, combos, zones] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, slug, allows_promotion")
      .eq("business_id", store.id)
      .order("sort_order")
      .throwOnError(),
    supabase
      .from("products")
      .select("id, category_id, name, description, price, stock, image_url, kind")
      .eq("business_id", store.id)
      .order("name")
      .throwOnError(),
    supabase
      .from("combos")
      .select("id, name, description, price, image_url, combo_items(quantity, products(price))")
      .eq("business_id", store.id)
      .order("price")
      .throwOnError(),
    supabase.from("delivery_zones").select("id, name, fee").eq("business_id", store.id).order("fee").throwOnError(),
  ]);

  return {
    categories: categories.data.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      allowsPromotion: c.allows_promotion,
    })),
    products: products.data.map((p) => ({
      id: p.id,
      categoryId: p.category_id,
      name: p.name,
      description: p.description,
      price: p.price,
      stock: p.stock,
      imageUrl: p.image_url,
      kind: p.kind === "service" ? "service" : "product",
    })),
    combos: combos.data.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      price: c.price,
      regularPrice: c.combo_items.reduce(
        (sum, item) => sum + item.quantity * (item.products as unknown as { price: number }).price,
        0,
      ),
      imageUrl: c.image_url,
    })),
    zones: zones.data,
  };
}
