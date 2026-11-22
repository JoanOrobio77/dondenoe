import type { Catalog } from "./types";

// Espejo de supabase/seed.sql para mostrar la tienda sin base de datos conectada.
export const demoCatalog: Catalog = {
  categories: [
    { id: 1, name: "Licores", slug: "licores", allowsPromotion: true },
    { id: 2, name: "Cervezas", slug: "cervezas", allowsPromotion: true },
    { id: 3, name: "Mezcladores y hielo", slug: "mezcladores", allowsPromotion: true },
    { id: 4, name: "Snacks", slug: "snacks", allowsPromotion: true },
    { id: 5, name: "Cigarrillos", slug: "cigarrillos", allowsPromotion: false },
  ],
  products: [
    { id: "p1", categoryId: 1, name: "Aguardiente Antioqueño 750 ml", description: "Tapa azul, sin azúcar", price: 65000, stock: 24, imageUrl: null },
    { id: "p2", categoryId: 1, name: "Aguardiente Antioqueño 375 ml", description: "Media", price: 35000, stock: 30, imageUrl: null },
    { id: "p3", categoryId: 1, name: "Ron Medellín 3 años 750 ml", description: "Añejo", price: 70000, stock: 18, imageUrl: null },
    { id: "p4", categoryId: 1, name: "Old Parr 12 años 750 ml", description: "Whisky escocés", price: 160000, stock: 6, imageUrl: null },
    { id: "p5", categoryId: 1, name: "Tequila José Cuervo 750 ml", description: "Reposado", price: 110000, stock: 0, imageUrl: null },
    { id: "p6", categoryId: 2, name: "Águila lata 330 ml", description: "Unidad", price: 3500, stock: 120, imageUrl: null },
    { id: "p7", categoryId: 2, name: "Club Colombia Dorada lata 330 ml", description: "Unidad", price: 4000, stock: 96, imageUrl: null },
    { id: "p8", categoryId: 2, name: "Poker six-pack", description: "6 latas de 330 ml", price: 18000, stock: 20, imageUrl: null },
    { id: "p9", categoryId: 3, name: "Hielo bolsa 2 kg", description: "Hielo en cubos", price: 4000, stock: 40, imageUrl: null },
    { id: "p10", categoryId: 3, name: "Coca-Cola 1,5 L", description: "Botella", price: 6500, stock: 36, imageUrl: null },
    { id: "p11", categoryId: 3, name: "Ginger Canada Dry 400 ml", description: "Botella", price: 4000, stock: 24, imageUrl: null },
    { id: "p12", categoryId: 3, name: "Agua Cristal 600 ml", description: "Botella", price: 2500, stock: 48, imageUrl: null },
    { id: "p13", categoryId: 4, name: "Papas Margarita 105 g", description: "Pollo o natural", price: 6000, stock: 30, imageUrl: null },
    { id: "p14", categoryId: 4, name: "Maní La Especial 180 g", description: "Mezcla de maní", price: 5500, stock: 25, imageUrl: null },
    { id: "p15", categoryId: 4, name: "Chicles Trident", description: "Paquete", price: 2000, stock: 40, imageUrl: null },
    { id: "p16", categoryId: 5, name: "Marlboro Rojo cajetilla x20", description: null, price: 11000, stock: 30, imageUrl: null },
    { id: "p17", categoryId: 5, name: "Lucky Strike cajetilla x20", description: null, price: 10000, stock: 30, imageUrl: null },
  ],
  combos: [
    { id: "c1", name: "Plan Parche", description: "Aguardiente 750 ml + hielo + 2 Coca-Cola 1,5 L", price: 78000, regularPrice: 82000, imageUrl: null },
    { id: "c2", name: "Plan Rumba", description: "Ron Medellín 750 ml + hielo + 2 Coca-Cola 1,5 L + 2 papas", price: 85000, regularPrice: 99000, imageUrl: null },
    { id: "c3", name: "Plan Cervecero", description: "2 six-pack Poker + hielo + 2 maní", price: 49000, regularPrice: 51000, imageUrl: null },
  ],
  zones: [
    { id: 1, name: "Mismo barrio", fee: 3000 },
    { id: 2, name: "Barrios cercanos", fee: 5000 },
    { id: 3, name: "Zona lejana", fee: 8000 },
  ],
};
