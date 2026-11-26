const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const DOMAIN =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

function hostname(value: string | null) {
  const first = (value ?? "").split(",")[0] ?? "";
  return first.trim().toLowerCase().replace(/:\d+$/, "");
}

// El superpanel solo vive en el dominio raíz, en localhost y en un preview.
// Un subdominio de negocio (incluido slug.localhost) no cuenta.
export function isPlatformConsoleHost(hostHeader: string | null, env = process.env) {
  const host = hostname(hostHeader);
  if (host === "localhost" || host === "127.0.0.1") return true;
  if (env.VERCEL_ENV === "preview") return true;
  const platform = hostname(env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "");
  return Boolean(platform) && host === platform;
}

export function isSlug(value: string) {
  return value.length <= 48 && SLUG.test(value);
}

export function ownerWelcomeUrl(slug: string, env = process.env) {
  const platform = hostname(env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "");
  if (platform) return `https://${slug}.${platform}/admin/bienvenida`;
  const port = env.PORT || "3000";
  return `http://${slug}.localhost:${port}/admin/bienvenida`;
}
