import { Wordmark } from "./wordmark";

export function StoreBrand({
  name,
  slug,
  logoUrl,
  brandColor,
  className = "text-5xl",
}: {
  name: string;
  slug: string;
  logoUrl: string | null;
  brandColor: string;
  className?: string;
}) {
  if (logoUrl) {
    return <img src={logoUrl} alt={name} className="h-14 w-auto max-w-[16rem] object-contain" />;
  }
  if (slug === "dondenoe") return <Wordmark className={className} />;
  return (
    <span className={`inline-block font-sans font-extrabold leading-none tracking-tight ${className}`} style={{ color: brandColor }}>
      {name}
    </span>
  );
}
