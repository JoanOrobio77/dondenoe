import Link from "next/link";
import { CheckoutForm } from "@/components/checkout-form";
import { Wordmark } from "@/components/wordmark";
import { getCatalog } from "@/lib/catalog";

export const metadata = { title: "Tu pedido · DondeNoe" };

export default async function OrderPage() {
  const { zones } = await getCatalog();

  return (
    <>
      <header className="border-b border-black/10 bg-[#fffaf6] px-4 py-4">
        <div className="mx-auto flex max-w-xl items-center gap-4">
          <Link href="/" className="text-2xl text-black" aria-label="Volver al catálogo">
            ←
          </Link>
          <div>
            <Wordmark className="text-2xl" />
            <h1 className="text-sm font-semibold text-slate-500">Confirmar pedido</h1>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
        <CheckoutForm zones={zones} />
      </main>
    </>
  );
}
