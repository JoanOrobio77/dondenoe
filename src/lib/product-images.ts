// Fotos de catálogo por nombre. Si el producto trae image_url desde Supabase, esa gana.
const byName: Record<string, string> = {
  "Aguardiente Antioqueño 750 ml": "/products/aguardiente-750.jpg",
  "Aguardiente Antioqueño 375 ml": "/products/aguardiente-375.jpg",
  "Ron Medellín 3 años 750 ml": "/products/ron-medellin.jpg",
  "Old Parr 12 años 750 ml": "/products/old-parr.jpg",
  "Tequila José Cuervo 750 ml": "/products/tequila.jpg",
  "Águila lata 330 ml": "/products/aguila.jpg",
  "Club Colombia Dorada lata 330 ml": "/products/club-colombia.jpg",
  "Poker six-pack": "/products/poker-six.jpg",
  "Hielo bolsa 2 kg": "/products/hielo.jpg",
  "Coca-Cola 1,5 L": "/products/coca-cola.jpg",
  "Ginger Canada Dry 400 ml": "/products/ginger.jpg",
  "Agua Cristal 600 ml": "/products/agua.jpg",
  "Papas Margarita 105 g": "/products/papas.jpg",
  "Maní La Especial 180 g": "/products/mani.jpg",
  "Chicles Trident": "/products/chicles.jpg",
  "Marlboro Rojo cajetilla x20": "/products/marlboro.jpg",
  "Lucky Strike cajetilla x20": "/products/lucky.jpg",
};

export function imageForProduct(name: string, imageUrl: string | null) {
  return imageUrl ?? byName[name] ?? null;
}
