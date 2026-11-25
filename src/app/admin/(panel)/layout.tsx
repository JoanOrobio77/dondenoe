import Link from "next/link";
import { signOut } from "../actions";

export default function PanelLayout({ children }: LayoutProps<"/admin">) {
  return (
    <>
      <header className="border-b-4 border-accent bg-brand-900 text-white">
        <div className="mx-auto flex max-w-5xl items-center gap-5 px-4 py-4">
          <p className="text-lg font-bold">DondeNoe · Panel</p>
          <nav className="flex gap-4 text-sm font-semibold text-brand-100">
            <Link href="/admin" className="hover:text-white">
              Pedidos
            </Link>
            <Link href="/admin/inventario" className="hover:text-white">
              Inventario
            </Link>
          </nav>
          <form action={signOut} className="ml-auto">
            <button className="text-sm text-brand-100 underline hover:text-white">Salir</button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </>
  );
}
