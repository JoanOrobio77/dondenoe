"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useActionState } from "react";
import { createProduct, updateProductImage } from "@/app/admin/actions";
import { formatCOP } from "@/lib/format";
import { prepareProductPhoto } from "@/lib/prepare-product-photo";

export type ProductCategoryOption = {
  id: number;
  name: string;
  allowsPromotion: boolean;
};

const inputClass = "mt-1 w-full rounded-xl border border-brand-100 px-3 py-2 outline-brand-700";

async function withPhoto(form: HTMLFormElement) {
  const data = new FormData(form);
  const file = data.get("image");
  if (file instanceof File && file.size > 0) {
    data.set("image", await prepareProductPhoto(file));
  }
  return data;
}

export function NewProductForm({ categories }: { categories: ProductCategoryOption[] }) {
  const [error, submit, pending] = useActionState(createProduct, null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [categoryId, setCategoryId] = useState(String(categories[0]?.id ?? ""));
  const [preview, setPreview] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const priceValue = Number(price);
  const costValue = Number(cost);
  const margin =
    priceValue > 0 && Number.isFinite(costValue) ? Math.round(((priceValue - costValue) / priceValue) * 100) : null;
  const category = categories.find((item) => String(item.id) === categoryId);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setLocalError(null);
    try {
      const data = await withPhoto(form);
      startTransition(() => submit(data));
    } catch {
      setLocalError("No pude leer esa foto. Usa una imagen JPG, PNG o WebP.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-2">
      <label className="block text-sm font-semibold text-slate-700 md:col-span-2">
        Nombre
        <input name="name" required maxLength={120} placeholder="Ej. Ron Medellín 750 ml" className={inputClass} />
      </label>
      <label className="block text-sm font-semibold text-slate-700">
        Categoría
        <select
          name="categoryId"
          required
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          className={inputClass}
        >
          {categories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-semibold text-slate-700">
        Descripción
        <input name="description" maxLength={300} placeholder="Ej. Botella, añejo" className={inputClass} />
      </label>
      {category && !category.allowsPromotion && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 md:col-span-2">
          Los cigarrillos no pueden ir en promociones ni destacarse. Se pueden vender, nada más.
        </p>
      )}
      <label className="block text-sm font-semibold text-slate-700">
        Precio de venta
        <input
          name="price"
          type="number"
          min={1}
          required
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          placeholder="70000"
          className={inputClass}
        />
      </label>
      <label className="block text-sm font-semibold text-slate-700">
        Costo
        <input
          name="cost"
          type="number"
          min={0}
          required
          value={cost}
          onChange={(event) => setCost(event.target.value)}
          placeholder="52000"
          className={inputClass}
        />
      </label>
      <p className="text-sm text-slate-600 md:col-span-2">
        {margin === null
          ? "El margen aparece cuando escribes precio y costo. Pesos enteros, sin decimales."
          : `Margen: ${margin}% · ganas ${formatCOP(priceValue - costValue)} por unidad.`}
        {margin !== null && margin < 0 && " El precio está por debajo del costo."}
      </p>
      <label className="block text-sm font-semibold text-slate-700">
        Stock inicial
        <input name="stock" type="number" min={0} defaultValue={0} required className={inputClass} />
      </label>
      <label className="block text-sm font-semibold text-slate-700">
        Stock mínimo
        <input name="minStock" type="number" min={0} defaultValue={0} required className={inputClass} />
      </label>
      <label className="block text-sm font-semibold text-slate-700 md:col-span-2">
        Nota de la entrada
        <input name="note" maxLength={200} placeholder="Ej. Compra del 25 de noviembre" className={inputClass} />
      </label>
      <label className="block text-sm font-semibold text-slate-700 md:col-span-2">
        Foto
        <input
          name="image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className={`${inputClass} file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1 file:font-semibold`}
          onChange={(event) => {
            const file = event.target.files?.[0];
            setPreview(file ? URL.createObjectURL(file) : null);
          }}
        />
      </label>
      {preview && (
        <img src={preview} alt="Vista previa del producto" className="h-24 w-24 rounded-xl bg-[#e7ecee] object-contain" />
      )}
      {(error || localError) && (
        <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700 md:col-span-2">{localError ?? error}</p>
      )}
      <button disabled={pending} className="rounded-xl bg-brand-700 px-4 py-3 font-bold text-white disabled:opacity-60 md:col-span-2">
        {pending ? "Guardando..." : "Agregar producto"}
      </button>
    </form>
  );
}

export function ProductPhotoField({ productId }: { productId: string }) {
  const [error, submit, pending] = useActionState(updateProductImage, null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setLocalError(null);
    try {
      const data = await withPhoto(form);
      startTransition(() => submit(data));
    } catch {
      setLocalError("No pude leer esa foto. Usa una imagen JPG, PNG o WebP.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-2 space-y-1">
      <input type="hidden" name="productId" value={productId} />
      <input name="image" type="file" accept="image/jpeg,image/png,image/webp" required className="block w-full text-xs" />
      <button disabled={pending} className="rounded-lg bg-black px-2 py-1 text-xs font-bold text-white disabled:opacity-60">
        {pending ? "Subiendo..." : "Guardar foto"}
      </button>
      {(error || localError) && <p className="text-xs font-semibold text-red-700">{localError ?? error}</p>}
    </form>
  );
}
