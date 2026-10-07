import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { EnTete, PiedDePage } from "@/components/cadre";
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
        <EnTete />
        {children}
        <PiedDePage />
      </body>
    </html>
  );
}
