export function StoreUnavailable({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-16 text-center">
      <h1 className="text-3xl font-bold text-brand-900">{title}</h1>
      <p className="mt-3 text-slate-600">{detail}</p>
    </main>
  );
}
