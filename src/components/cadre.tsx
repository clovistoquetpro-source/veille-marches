"use client";

/**
 * En-tête et pied de page communs. Les pages au nouveau design (fond sombre plein écran) portent
 * leur propre navigation : le cadre s'efface sur elles.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NOM } from "@/lib/produit";

const PAGES_IMMERSIVES = new Set(["/", "/inscription", "/connexion", "/connexion/nouveau"]);

function immersive(chemin: string | null) {
  return chemin !== null && PAGES_IMMERSIVES.has(chemin);
}

export function EnTete() {
  if (immersive(usePathname())) return null;
  return (
    <header className="border-b">
      <nav className="mx-auto flex max-w-6xl gap-5 px-6 py-3 text-sm">
        <Link href="/" className="font-semibold">{NOM}</Link>
        <Link href="/avis">Avis publiés</Link>
        <Link href="/renouvellements">Renouvellements</Link>
        <Link href="/veille" className="ml-auto">Ma veille</Link>
      </nav>
    </header>
  );
}

export function PiedDePage() {
  if (immersive(usePathname())) return null;
  return (
    <footer className="mt-16 border-t">
      <nav className="mx-auto flex max-w-6xl flex-wrap gap-4 px-6 py-6 text-xs text-gray-600">
        <span>{NOM}</span>
        <Link href="/mentions-legales" className="underline">Mentions légales</Link>
        <Link href="/conditions" className="underline">Conditions</Link>
        <Link href="/confidentialite" className="underline">Données personnelles</Link>
        <Link href="/abonnement" className="underline">Abonnement</Link>
      </nav>
    </footer>
  );
}
