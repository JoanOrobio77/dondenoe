import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { isPlatformConsoleHost } from "./lib/platform";
import { tenantHint } from "./lib/tenant";

async function resolvedSlug(hostHeader: string | null, negocio: string | null) {
  const hint = tenantHint(hostHeader, negocio);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (hint.domain && url && key) {
    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data } = await supabase.rpc("public_store_by_domain", { p_domain: hint.domain }).maybeSingle<{ slug: string }>();
    if (data?.slug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug)) return { hint, slug: data.slug };
  }
  return { hint, slug: hint.slug };
}

export async function proxy(request: NextRequest) {
  const negocio = request.nextUrl.searchParams.get("negocio");
  const hostHeader = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const { hint, slug } = await resolvedSlug(hostHeader, negocio);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-business-host", hint.host);
  requestHeaders.set("x-business-query", negocio ?? "");
  requestHeaders.set("x-business-slug", slug ?? "");

  const path = request.nextUrl.pathname;
  const isAdmin = path.startsWith("/admin");
  const isPlatform = path.startsWith("/plataforma");

  if (isPlatform && !isPlatformConsoleHost(hint.host)) {
    return new NextResponse("No encontrado", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8", "x-robots-tag": "noindex" },
    });
  }

  if (!isAdmin && !isPlatform) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  let response = NextResponse.next({ request: { headers: requestHeaders } });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: requestHeaders } });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const isPublic = path === "/admin/login" || path === "/admin/bienvenida" || path === "/plataforma/login";
  if (!data?.claims && !isPublic) {
    const login = isPlatform ? "/plataforma/login" : "/admin/login";
    return NextResponse.redirect(new URL(login, request.url));
  }
  if (isPlatform && data?.claims && path !== "/plataforma/login") {
    const { data: allowed } = await supabase.rpc("is_platform_admin");
    if (allowed !== true) {
      return NextResponse.redirect(new URL("/plataforma/login?error=no-admin", request.url));
    }
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
