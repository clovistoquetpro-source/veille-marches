import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { NOM } from "@/lib/produit";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: `${NOM} : appels d'offres et renouvellements`, template: `%s · ${NOM}` },
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
            <Link href="/" className="font-semibold">{NOM}</Link>
            <Link href="/avis">Avis publiés</Link>
            <Link href="/renouvellements">Renouvellements</Link>
            <Link href="/veille" className="ml-auto">Ma veille</Link>
          </nav>
        </header>
        {children}
        <footer className="mt-16 border-t">
          <nav className="mx-auto flex max-w-6xl flex-wrap gap-4 px-6 py-6 text-xs text-gray-600">
            <span>{NOM}</span>
            <Link href="/mentions-legales" className="underline">Mentions légales</Link>
            <Link href="/conditions" className="underline">Conditions</Link>
            <Link href="/confidentialite" className="underline">Données personnelles</Link>
            <Link href="/abonnement" className="underline">Abonnement</Link>
          </nav>
        </footer>
      </body>
    </html>
  );
}
