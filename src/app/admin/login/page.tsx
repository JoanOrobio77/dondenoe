import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata = { title: "Panel · DondeNoe" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm ring-1 ring-brand-100">
        <h1 className="text-2xl font-bold text-brand-900">DondeNoe</h1>
        <p className="mb-6 text-sm text-slate-500">Panel de administración</p>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
