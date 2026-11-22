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
};

export type Combo = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  regularPrice: number;
  imageUrl: string | null;
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
