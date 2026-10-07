import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { EnTete, PiedDePage } from "@/components/cadre";
import { sora } from "@/lib/polices";
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
  applicationName: NOM,
};

/** Couleur de la barre du navigateur sur mobile : le fond sombre de la charte. */
export const viewport: Viewport = { themeColor: "#0B0B0F" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={sora.variable}>
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
