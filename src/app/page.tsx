import { AgeGate } from "@/components/age-gate";
import { CartBar } from "@/components/cart-bar";
import { CatalogView } from "@/components/catalog-view";
import { Wordmark } from "@/components/wordmark";
import { getCatalog, getPromotions } from "@/lib/catalog";
import { formatCOP } from "@/lib/format";
import { whatsappLink } from "@/lib/whatsapp";

export default async function Home() {
  const [catalog, promotions] = await Promise.all([getCatalog(), getPromotions()]);
  const minFee = Math.min(...catalog.zones.map((z) => z.fee));

  return (
    <>
      <AgeGate />
      <header className="relative overflow-hidden px-4 pb-7 pt-8">
        <div className="mx-auto max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-700">Estanco a domicilio</p>
          <h1 className="mt-2">
            <Wordmark className="text-6xl sm:text-7xl" />
          </h1>
          <p className="mt-3 max-w-sm text-lg text-slate-700">
            Licores, cervezas, hielo y combos. Armas el pedido y te lo llevamos.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-sm font-semibold">
            {catalog.zones.length > 0 && (
              <span className="rounded-full bg-black px-3 py-1.5 text-white">Domicilios desde {formatCOP(minFee)}</span>
            )}
            <span className="rounded-full bg-[#e10600] px-3 py-1.5 text-white">Solo mayores de 18</span>
            <span className="rounded-full bg-white px-3 py-1.5 text-brand-900 ring-1 ring-black/10">Pagas al recibir</span>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-1.5 bg-linear-to-r from-[#e10600] via-accent to-brand-700" />
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-32 pt-6">
        {promotions.length > 0 && (
          <section className="mb-8 space-y-3">
            {promotions.map((promo) => (
              <article key={promo.id} className="rounded-2xl bg-[#e10600] p-4 text-white">
                <p className="text-xs font-bold uppercase tracking-wider text-white/80">Promoción</p>
                <h2 className="text-xl font-bold">{promo.title}</h2>
                {promo.description && <p className="mt-1 text-sm text-white/90">{promo.description}</p>}
                {promo.discountPercent ? <p className="mt-2 text-sm font-semibold">{promo.discountPercent}% de descuento</p> : null}
              </article>
            ))}
          </section>
        )}
        <CatalogView catalog={catalog} />
      </main>

      <footer className="px-4 py-6 pb-24 text-center text-xs text-slate-500">
        <p>Prohíbase el expendio de bebidas embriagantes a menores de edad. Ley 124 de 1994.</p>
        <p className="mt-1">El exceso de alcohol es perjudicial para la salud. Ley 30 de 1986.</p>
        <p className="mt-1">Fumar es perjudicial para la salud. Venta prohibida a menores de 18 años.</p>
        <p className="mt-3">Horario: todos los días, 11:00 a. m. a 10:00 p. m.</p>
        {catalog.zones.length > 0 && (
          <p className="mt-1">
            Zonas: {catalog.zones.map((zone) => `${zone.name} ${formatCOP(zone.fee)}`).join(" · ")}
          </p>
        )}
        {process.env.NEXT_PUBLIC_WHATSAPP_NUMBER && (
          <p className="mt-2">
            <a
              href={whatsappLink("Hola DondeNoe, quiero hacer un pedido.")}
              className="font-semibold text-brand-700 underline"
            >
              Escribir por WhatsApp
            </a>
          </p>
        )}
      </footer>

      <CartBar />
    </>
  );
}
