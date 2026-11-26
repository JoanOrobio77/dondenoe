import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { savePromotion, setPromotionActive } from "../../actions";

export const metadata = { title: "Promociones · DondeNoe" };

const inputClass = "mt-1 w-full rounded-xl border border-brand-100 px-3 py-2";

export default function PromotionsPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">Cargando promociones...</p>}>
      <Promotions />
    </Suspense>
  );
}

async function Promotions() {
  const { supabase, business } = await requireAdmin();
  const { data: promotions } = await supabase
    .from("promotions")
    .select("id, title, description, discount_percent, ends_at, active")
    .eq("business_id", business.id)
    .order("starts_at", { ascending: false })
    .throwOnError();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-900">Promociones</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Se muestran en la tienda y se pueden mandar a quien pidió avisos. El precio del pedido no cambia solo: si hay
          descuento, confírmalo por WhatsApp. No armes promociones de cigarrillos.
        </p>
      </div>

      <form action={savePromotion} className="grid gap-3 rounded-2xl bg-white p-4 ring-1 ring-brand-100 md:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700">
          Título
          <input name="title" required placeholder="Fin de semana: 2 six-pack + hielo" className={inputClass} />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Descuento % (opcional)
          <input name="discount" type="number" min={0} max={100} className={inputClass} />
        </label>
        <label className="text-sm font-semibold text-slate-700 md:col-span-2">
          Detalle
          <input name="description" placeholder="Válido viernes a domingo" className={inputClass} />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Termina
          <input name="endsAt" type="datetime-local" className={inputClass} />
        </label>
        <div className="flex items-end">
          <button className="rounded-xl bg-brand-700 px-4 py-2 font-bold text-white">Publicar</button>
        </div>
      </form>

      <ul className="space-y-3">
        {promotions.map((promo) => (
          <li key={promo.id} className="flex items-start justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-brand-100">
            <div>
              <p className="font-bold text-brand-900">{promo.title}</p>
              {promo.description && <p className="text-sm text-slate-600">{promo.description}</p>}
              <p className="mt-1 text-xs text-slate-500">
                {promo.discount_percent ? `${promo.discount_percent}% · ` : ""}
                {promo.ends_at
                  ? `hasta ${new Date(promo.ends_at).toLocaleString("es-CO", { timeZone: "America/Bogota" })}`
                  : "sin fecha de fin"}
                {promo.active ? "" : " · pausada"}
              </p>
            </div>
            <form action={setPromotionActive}>
              <input type="hidden" name="promotionId" value={promo.id} />
              <input type="hidden" name="active" value={promo.active ? "false" : "true"} />
              <button className="rounded-xl px-3 py-2 text-sm font-semibold ring-1 ring-brand-100">
                {promo.active ? "Pausar" : "Activar"}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
