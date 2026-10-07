"use client";

/** Barre du haut de la page d'accueil : transparente sur l'ouverture, en verre dès qu'on descend. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { NOM } from "@/lib/produit";
import { BoutonGlisse } from "./boutons";

const ANCRES = [
  { href: "#reseau", texte: "Comment ça marche" },
  { href: "#alertes", texte: "Les alertes" },
  { href: "#tarif", texte: "Tarif" },
  { href: "#questions", texte: "Questions" },
];

export function Navigation() {
  const [descendu, setDescendu] = useState(false);
  useEffect(() => {
    const lire = () => setDescendu(scrollY > 24);
    lire();
    addEventListener("scroll", lire, { passive: true });
    return () => removeEventListener("scroll", lire);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-4">
      <nav className={`nav-vitrine mx-auto flex h-14 max-w-6xl items-center gap-4 rounded-full px-4 sm:px-5 ${descendu ? "descendu" : ""}`}>
        <Link href="/" className="flex shrink-0 items-center gap-2.5 text-[15px] font-semibold tracking-tight whitespace-nowrap">
          <span className="logo-radar" aria-hidden="true" />
          {NOM}
        </Link>
        <span className="hidden flex-1 justify-center gap-7 text-sm text-[#a3a3b2] lg:flex">
          {ANCRES.map((a) => (
            <a key={a.href} href={a.href} className="lien-doux">{a.texte}</a>
          ))}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-2 lg:ml-0">
          <Link href="/connexion" className="lien-doux hidden px-3 text-sm text-[#c9c9d4] sm:block">Se connecter</Link>
          <Link href="/connexion" className="pilule-discrete sm:hidden">Se connecter</Link>
          <BoutonGlisse href="/connexion?mode=creer" className="petit hidden sm:inline-flex">Créer un compte</BoutonGlisse>
        </span>
      </nav>
    </header>
  );
}
