"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Pedidos" },
  { href: "/admin/inventario", label: "Inventario" },
  { href: "/admin/clientes", label: "Clientes" },
  { href: "/admin/reportes", label: "Reportes" },
  { href: "/admin/promociones", label: "Promociones" },
  { href: "/admin/productos", label: "Productos" },
  { href: "/admin/zonas", label: "Zonas" },
  { href: "/admin/ayuda", label: "Capacitación" },
] as const;

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {LINKS.map((link) => {
        const active = link.href === "/admin" ? pathname === "/admin" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-2xl px-3 py-3 text-sm font-bold ${
              active ? "bg-black text-white" : "bg-white text-black ring-1 ring-black/10"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
