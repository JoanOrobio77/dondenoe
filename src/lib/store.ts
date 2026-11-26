import { cache } from "react";
import { headers } from "next/headers";
import { createPublicClient, isSupabaseConfigured } from "./supabase/public";
import { tenantHint } from "./tenant";
import type { OpeningHours, Store, StoreStatus } from "./types";

const DONDENOE_HOURS: OpeningHours = {
  mon: { open: "11:00", close: "22:00" },
  tue: { open: "11:00", close: "22:00" },
  wed: { open: "11:00", close: "22:00" },
  thu: { open: "11:00", close: "22:00" },
  fri: { open: "11:00", close: "22:00" },
  sat: { open: "11:00", close: "22:00" },
  sun: { open: "11:00", close: "22:00" },
};

export const demoStore: Store = {
  id: "00000000-0000-0000-0000-000000000000",
  slug: "dondenoe",
  name: "DondeNoe",
  logoUrl: null,
  brandColor: "#0b4a56",
  whatsapp: null,
  timezone: "America/Bogota",
  status: "active",
  ageVerification: true,
  tobaccoRules: true,
  delivery: true,
  openingHours: DONDENOE_HOURS,
  ordersOpen: true,
  template: "tienda",
};

type StoreRow = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  brand_color: string;
  whatsapp_number: string | null;
  timezone: string;
  status: StoreStatus;
  age_verification: boolean;
  tobacco_rules: boolean;
  delivery: boolean;
  opening_hours: OpeningHours;
  orders_open?: boolean;
  template?: string;
};

function mapStore(row: StoreRow): Store {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    logoUrl: row.logo_url,
    brandColor: row.brand_color,
    whatsapp: row.whatsapp_number,
    timezone: row.timezone || "America/Bogota",
    status: row.status,
    ageVerification: row.age_verification,
    tobaccoRules: row.tobacco_rules,
    delivery: row.delivery,
    openingHours: row.opening_hours ?? {},
    ordersOpen: typeof row.orders_open === "boolean" ? row.orders_open : row.status === "trial" || row.status === "active",
    template: row.template === "agenda" ? "agenda" : "tienda",
  };
}

export async function loadStore(slug: string): Promise<Store | null> {
  if (!isSupabaseConfigured()) return slug === "dondenoe" ? demoStore : null;
  const { data, error } = await createPublicClient().rpc("public_store", { p_slug: slug }).maybeSingle<StoreRow>();
  if (error || !data) return null;
  return mapStore(data);
}

export async function loadStoreByDomain(domain: string): Promise<Store | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await createPublicClient()
    .rpc("public_store_by_domain", { p_domain: domain })
    .maybeSingle<StoreRow>();
  if (error || !data) return null;
  return mapStore(data);
}

export const resolveRequest = cache(async () => {
  const headerStore = await headers();
  const host = headerStore.get("x-business-host") || headerStore.get("x-forwarded-host") || headerStore.get("host");
  const hint = tenantHint(host, headerStore.get("x-business-query"));

  if (!isSupabaseConfigured()) {
    const slug = hint.slug ?? (hint.domain ? null : "dondenoe");
    return { slug, store: slug === "dondenoe" ? demoStore : null };
  }

  if (hint.domain) {
    const byDomain = await loadStoreByDomain(hint.domain);
    if (byDomain) return { slug: byDomain.slug, store: byDomain };
  }
  if (!hint.slug) return { slug: null, store: null };
  return { slug: hint.slug, store: await loadStore(hint.slug) };
});
