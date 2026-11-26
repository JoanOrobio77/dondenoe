import { requirePlatformAdmin } from "@/lib/auth";

export async function GET() {
  const { supabase } = await requirePlatformAdmin();
  const { data } = await supabase
    .from("master_products")
    .select("name, brand, kind, presentation, volume_ml, units_per_pack, barcode, aliases, active, draft")
    .order("name");
  const header = "nombre,marca,tipo,presentacion,volumen_ml,unidades,codigo_barras,alias,activo,borrador";
  const lines = (data ?? []).map((row) =>
    [
      row.name,
      row.brand,
      row.kind,
      row.presentation,
      row.volume_ml ?? "",
      row.units_per_pack,
      row.barcode ?? "",
      (row.aliases ?? []).join("|"),
      row.active ? "si" : "no",
      row.draft ? "si" : "no",
    ]
      .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
      .join(","),
  );
  return new Response([header, ...lines].join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=catalogo-maestro.csv",
    },
  });
}
