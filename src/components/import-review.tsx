"use client";

import { useState } from "react";
import { confirmImport } from "@/app/admin/import-actions";
import { lowConfidence } from "@/lib/import/match";

export type ReviewLine = {
  nombre: string;
  presentacion: string | null;
  cantidad: number | null;
  precio_unitario: number | null;
  codigo_barras: string | null;
  confianza: number | null;
  costo: number | null;
  master_product_id: string | null;
  master_name: string | null;
  score: number | null;
  product_id: string | null;
  product_name: string | null;
  action: "crear" | "vincular" | "actualizar" | "omitir";
};

const ACTIONS = [
  ["crear", "Crear nuevo"],
  ["vincular", "Vincular al catálogo"],
  ["actualizar", "Actualizar existente"],
  ["omitir", "Omitir"],
] as const;

export function ImportReview({
  jobId,
  lines,
  categories,
  masters,
  owner,
}: {
  jobId: string;
  lines: ReviewLine[];
  categories: { id: number; name: string }[];
  masters: { id: string; name: string; presentation: string }[];
  owner: boolean;
}) {
  const [rows, setRows] = useState(lines);
  const [error, setError] = useState<string | null>(null);

  function update(index: number, patch: Partial<ReviewLine>) {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  return (
    <form
      action={confirmImport}
      onSubmit={(event) => {
        const data = new FormData(event.currentTarget);
        const payload = rows.map((row, index) => ({
          action: row.action,
          name: row.nombre,
          presentation: row.presentacion,
          master_product_id: String(data.get(`master-${index}`) || ""),
          product_id: row.product_id,
          category_id: Number(data.get(`category-${index}`) || 0),
          price: Number(data.get(`price-${index}`) || 0),
          quantity: Number(data.get(`qty-${index}`) || 0),
          barcode: row.codigo_barras,
          ...(owner ? { cost: Number(data.get(`cost-${index}`) || 0) } : {}),
        }));
        const invalid = payload.some(
          (line) =>
            line.action !== "omitir" &&
            (!line.name.trim() ||
              line.price <= 0 ||
              (line.action === "vincular" && !line.master_product_id) ||
              ((line.action === "crear" || line.action === "vincular") && !line.category_id)),
        );
        if (invalid) {
          event.preventDefault();
          setError("Revisa nombre, precio, categoría y la acción de cada línea. Nada se guardó.");
          return;
        }
        const hidden = event.currentTarget.elements.namedItem("lines");
        if (hidden instanceof HTMLInputElement) hidden.value = JSON.stringify(payload);
      }}
    >
      <input type="hidden" name="id" value={jobId} />
      <input type="hidden" name="lines" />
      <p className="text-sm text-slate-600">Las filas amarillas tienen baja confianza. Confirma antes de guardar.</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead>
            <tr className="text-slate-500">
              <th className="p-2">Producto</th>
              <th className="p-2">Sugerencia</th>
              <th className="p-2">Acción</th>
              <th className="p-2">Categoría</th>
              <th className="p-2">Precio</th>
              {owner && <th className="p-2">Costo</th>}
              <th className="p-2">Cantidad</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const warn = lowConfidence(row.confianza, row.score);
              return (
                <tr key={`${row.nombre}-${index}`} className={warn ? "bg-amber-100" : undefined}>
                  <td className="p-2">
                    <input
                      value={row.nombre}
                      onChange={(event) => update(index, { nombre: event.target.value })}
                      className="w-full rounded-lg border border-black/10 px-2 py-1"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      {row.presentacion || "Sin presentación"}
                      {row.score !== null ? ` · parecido ${Math.round(row.score * 100)}%` : ""}
                      {row.product_name ? ` · ya está: ${row.product_name}` : ""}
                    </p>
                  </td>
                  <td className="p-2">
                    <select name={`master-${index}`} defaultValue={row.master_product_id ?? ""} className="max-w-52 rounded-lg border border-black/10 px-2 py-1">
                      <option value="">Sin catálogo</option>
                      {masters.map((master) => (
                        <option key={master.id} value={master.id}>
                          {master.name} {master.presentation}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2">
                    <select
                      value={row.action}
                      onChange={(event) => update(index, { action: event.target.value as ReviewLine["action"] })}
                      className="rounded-lg border border-black/10 px-2 py-1"
                    >
                      {ACTIONS.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2">
                    <select name={`category-${index}`} className="rounded-lg border border-black/10 px-2 py-1" disabled={row.action === "actualizar" || row.action === "omitir"}>
                      <option value="">Categoría</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2">
                    <input name={`price-${index}`} type="number" min={0} defaultValue={row.precio_unitario ?? ""} className="w-24 rounded-lg border border-black/10 px-2 py-1" />
                  </td>
                  {owner && (
                    <td className="p-2">
                      <input name={`cost-${index}`} type="number" min={0} defaultValue={row.costo ?? ""} className="w-24 rounded-lg border border-black/10 px-2 py-1" />
                    </td>
                  )}
                  <td className="p-2">
                    <input name={`qty-${index}`} type="number" min={0} defaultValue={row.cantidad ?? 0} className="w-20 rounded-lg border border-black/10 px-2 py-1" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {error && <p className="mt-3 text-sm font-semibold text-red-700">{error}</p>}
      <button className="mt-4 rounded-xl bg-brand-700 px-4 py-3 font-bold text-white">Confirmar y guardar</button>
    </form>
  );
}
