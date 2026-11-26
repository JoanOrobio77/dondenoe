export type Category = {
  id: number;
  name: string;
  slug: string;
  allowsPromotion: boolean;
};

export type Product = {
  id: string;
  categoryId: number;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  imageUrl: string | null;
  kind?: "product" | "service";
};

export type Combo = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  regularPrice: number;
  imageUrl: string | null;
};

export type AdminProductRow = {
  id: string;
  category_id: number;
  name: string;
  description: string | null;
  price: number;
  cost: number;
  stock: number;
  min_stock: number;
  image_url: string | null;
  active: boolean;
  kind: "product" | "service";
  duration_minutes: number | null;
  created_at: string;
};

export type StoreStatus = "trial" | "active" | "past_due" | "suspended";
export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type DayHours = { open: string; close: string };
export type OpeningHours = Partial<Record<DayKey, DayHours | null>>;

export type Store = {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  brandColor: string;
  whatsapp: string | null;
  timezone: string;
  status: StoreStatus;
  ageVerification: boolean;
  tobaccoRules: boolean;
  delivery: boolean;
  openingHours: OpeningHours;
};

export type DeliveryZone = {
  id: number;
  name: string;
  fee: number;
};

export type Catalog = {
  categories: Category[];
  products: Product[];
  combos: Combo[];
  zones: DeliveryZone[];
};

export type CartItem = {
  type: "product" | "combo";
  id: string;
  name: string;
  price: number;
  quantity: number;
};
