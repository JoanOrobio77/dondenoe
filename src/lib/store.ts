import { cache } from "react";
import { headers } from "next/headers";
import { createPublicClient, isSupabaseConfigured } from "./supabase/public";
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
};

export function storeIsOpen(status: StoreStatus) {
  return status === "trial" || status === "active";
}

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
  };
}

export async function loadStore(slug: string): Promise<Store | null> {
  if (!isSupabaseConfigured()) return slug === "dondenoe" ? demoStore : null;
  const { data, error } = await createPublicClient().rpc("public_store", { p_slug: slug }).maybeSingle<StoreRow>();
  if (error || !data) return null;
  return mapStore(data);
}

export const resolveRequest = cache(async () => {
  const headerStore = await headers();
  const raw = headerStore.get("x-business-slug")?.trim().toLowerCase() ?? "";
  const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw) ? raw : null;
  if (!isSupabaseConfigured()) return { slug: slug ?? "dondenoe", store: demoStore };
  if (!slug) return { slug: null, store: null };
  return { slug, store: await loadStore(slug) };
});
