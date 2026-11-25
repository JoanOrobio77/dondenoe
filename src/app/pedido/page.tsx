import Link from "next/link";
import { CheckoutForm } from "@/components/checkout-form";
import { getCatalog } from "@/lib/catalog";

export const metadata = { title: "Tu pedido · DondeNoe" };

export default async function OrderPage() {
  const { zones } = await getCatalog();

  return (
    <>
      <header className="border-b-4 border-accent bg-brand-900 px-4 py-5 text-white">
        <div className="mx-auto flex max-w-xl items-center gap-4">
          <Link href="/" className="text-2xl" aria-label="Volver al catálogo">
            ←
          </Link>
          <h1 className="text-xl font-bold">Confirmar pedido</h1>
        </div>
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
        <CheckoutForm zones={zones} />
      </main>
    </>
  );
}
