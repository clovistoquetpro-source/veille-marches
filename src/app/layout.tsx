import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Veille des marchés publics", template: "%s · Veille des marchés publics" },
  description: "Alertes sur les nouveaux appels d'offres et sur les marchés publics qui seront relancés dans 6 à 12 mois.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <header className="border-b">
          <nav className="mx-auto flex max-w-6xl gap-5 px-6 py-3 text-sm">
            <Link href="/" className="font-semibold">Radar des marchés publics</Link>
            <Link href="/avis">Avis publiés</Link>
            <Link href="/renouvellements">Renouvellements</Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
