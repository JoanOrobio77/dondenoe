import { CreateBusinessForm } from "./create-form";

export const metadata = { title: "Nuevo negocio · Plataforma" };

export default function NewBusinessPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold text-brand-900">Nuevo negocio</h1>
      <CreateBusinessForm />
    </div>
  );
}
