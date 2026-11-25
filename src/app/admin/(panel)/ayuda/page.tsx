import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";

export const metadata = { title: "Capacitación · DondeNoe" };

export default function HelpPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">Cargando capacitación...</p>}>
      <Help />
    </Suspense>
  );
}

async function Help() {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-brand-900">Capacitación</h1>
        <p className="mt-1 text-sm text-slate-600">Dos sesiones para dejar a Noe operando solo. Cada una cabe en una hora.</p>
      </div>

      <Session
        number="1"
        title="El pedido del día"
        steps={[
          "El cliente arma el pedido en la tienda y lo manda por WhatsApp. En Pedidos aparece con estado Nuevo.",
          "Confirma el pedido cuando el WhatsApp coincida con lo registrado. Si no coincide, cancélalo y pídele que lo vuelva a enviar.",
          "Al salir el domicilio, márcalo En camino. Al entregar, pide la cédula y márcalo Entregado. Ahí se descuenta el inventario, también lo que va dentro de un combo.",
          "Cuando llegue mercancía, regístrala en Inventario como Entrada. Si se rompe o se pierde algo, usa Ajuste con un número negativo.",
          "La alerta naranja de Inventario es la lista de lo que hay que comprar antes de que se agote.",
        ]}
      />

      <Session
        number="2"
        title="Precios, clientes y cifras"
        steps={[
          "En Productos reemplaza los precios y costos de ejemplo por los reales. El costo es lo que Noe paga; sin eso el reporte de ganancia sale mal.",
          "En Zonas ajusta los nombres y las tarifas del barrio. Una zona inactiva deja de salir en la tienda.",
          "En Promociones publica la de fin de semana o quincena. No incluyas cigarrillos: la ley no permite promocionarlos.",
          "En Clientes, usa Recordar solo con quien marcó que quiere avisos. El mensaje no se envía solo: WhatsApp se abre para que Noe lo mande.",
          "En Reportes mira, una vez por semana, qué se vendió, qué dejó ganancia y a qué hora piden. Con eso decide qué comprar y a qué hora tener el domicilio listo.",
        ]}
      />
    </div>
  );
}

function Session({ number, title, steps }: { number: string; title: string; steps: string[] }) {
  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-brand-100">
      <p className="text-sm font-bold text-[#e10600]">Sesión {number}</p>
      <h2 className="text-xl font-bold text-brand-900">{title}</h2>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-700">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </section>
  );
}
