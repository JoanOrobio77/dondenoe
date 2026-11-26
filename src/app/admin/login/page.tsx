import { Suspense } from "react";
import { StoreBrand } from "@/components/store-brand";
import { StoreUnavailable } from "@/components/store-unavailable";
import { resolveRequest } from "@/lib/store";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="px-4 py-8 text-slate-500">Cargando acceso...</p>}>
      <Login />
    </Suspense>
  );
}

async function Login() {
  const { slug, store } = await resolveRequest();
  if (!slug || !store) {
    return (
      <StoreUnavailable
        title="No hay una tienda en esta dirección"
        detail="El panel abre en la dirección del negocio. En pruebas usa ?negocio=dondenoe."
      />
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm ring-1 ring-brand-100">
        <h1>
          <StoreBrand
            name={store.name}
            slug={store.slug}
            logoUrl={store.logoUrl}
            brandColor={store.brandColor}
            className="text-4xl"
          />
        </h1>
        <p className="mb-6 mt-1 text-sm text-slate-500">Panel de {store.name}</p>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
