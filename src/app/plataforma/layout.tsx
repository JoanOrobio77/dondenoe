import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Plataforma",
  robots: { index: false, follow: false },
};

export default function PlatformLayout({ children }: LayoutProps<"/plataforma">) {
  return children;
}
