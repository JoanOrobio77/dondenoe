const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DOMAIN =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

export type TenantHint = {
  host: string;
  domain: string | null;
  slug: string | null;
};

function hostname(value: string | null) {
  const first = (value ?? "").split(",")[0] ?? "";
  return first.trim().toLowerCase().replace(/:\d+$/, "");
}

// a) dominio completo, b) {slug}.plataforma, c) ?negocio= solo en local o en un preview.
export function tenantHint(hostHeader: string | null, negocio: string | null, env = process.env): TenantHint {
  const host = hostname(hostHeader);
  const platform = hostname(env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "");
  const local = host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost");
  const domain = !local && host.length <= 253 && DOMAIN.test(host) ? host : null;

  let slug: string | null = null;
  if (platform && host !== platform && host.endsWith(`.${platform}`)) {
    const sub = host.slice(0, -(platform.length + 1));
    if (SLUG.test(sub)) slug = sub;
  }
  if (!slug && host.endsWith(".localhost")) {
    const sub = host.slice(0, -".localhost".length);
    if (SLUG.test(sub)) slug = sub;
  }

  const production = env.VERCEL_ENV === "production";
  const queryAllowed = !production && (local || env.VERCEL_ENV === "preview");
  if (!slug && queryAllowed) {
    const query = (negocio ?? "").trim().toLowerCase();
    if (SLUG.test(query)) slug = query;
  }

  return { host, domain, slug };
}
