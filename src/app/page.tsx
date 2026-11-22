import { AgeGate } from "@/components/age-gate";
import { CartBar } from "@/components/cart-bar";
import { CatalogView } from "@/components/catalog-view";
import { getCatalog } from "@/lib/catalog";
import { formatCOP } from "@/lib/format";

export default async function Home() {
  const catalog = await getCatalog();
  const minFee = Math.min(...catalog.zones.map((z) => z.fee));

  return (
    <>
      <AgeGate />
      <header className="border-b-4 border-accent bg-brand-900 px-4 pb-6 pt-8 text-white">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-3xl font-bold">DondeNoe</h1>
          <p className="mt-1 text-brand-100">Licores, cervezas, hielo y combos a domicilio</p>
          {catalog.zones.length > 0 && (
            <p className="mt-3 inline-block rounded-full bg-white/10 px-3 py-1 text-sm">
              Domicilios desde {formatCOP(minFee)}
            </p>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-32 pt-6">
        <CatalogView catalog={catalog} />
      </main>

      <footer className="bg-brand-100 px-4 py-6 pb-24 text-center text-xs text-brand-900">
        <p>Prohíbase el expendio de bebidas embriagantes a menores de edad. Ley 124 de 1994.</p>
        <p className="mt-1">El exceso de alcohol es perjudicial para la salud. Ley 30 de 1986.</p>
        <p className="mt-1">Fumar es perjudicial para la salud. Venta prohibida a menores de 18 años.</p>
      </footer>

      <CartBar />
    </>
  );
}
