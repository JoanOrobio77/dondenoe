const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// {slug}.DOMINIO_PLATAFORMA. En local también ?negocio=slug o slug.localhost.
// El parámetro de la URL solo vale en el computador de desarrollo.
export function slugFromRequest(hostHeader: string | null, negocio: string | null): string | null {
  const host = (hostHeader ?? "").split(":")[0].toLowerCase();
  const platform = (process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "").trim().toLowerCase().split(":")[0];
  const local = host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost");

  if (local) {
    const query = (negocio ?? "").trim().toLowerCase();
    if (SLUG.test(query)) return query;
    if (host.endsWith(".localhost")) {
      const sub = host.slice(0, -".localhost".length);
      if (SLUG.test(sub)) return sub;
    }
    return null;
  }

  if (!platform || host === platform || !host.endsWith(`.${platform}`)) return null;
  const sub = host.slice(0, -(platform.length + 1));
  if (!SLUG.test(sub)) return null;
  return sub;
}
