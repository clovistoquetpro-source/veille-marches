"use client";

/**
 * Les deux boutons animés de la page d'accueil, inspirés des exemples Originkit choisis par clo
 * (« Label Slide » et « Scan Grid »), refaits en CSS avec un peu de JavaScript : pas de bibliothèque
 * d'animation à charger.
 */
import Link from "next/link";
import { useRef } from "react";

function Fleche() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
      <path d="M5 11 11 5M6 5h5v5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Au survol, le texte monte et sa copie arrive par le bas ; la flèche part en diagonale et une autre
 * la remplace ; le fond change de teinte. Au clic, le bouton s'enfonce un peu.
 */
export function BoutonGlisse({ href, children, variante = "plein", className = "" }: {
  href: string;
  children: string;
  variante?: "plein" | "verre";
  className?: string;
}) {
  return (
    <Link href={href} className={`bouton-glisse ${variante === "verre" ? "glisse-verre" : ""} ${className}`}>
      <span className="glisse-texte">
        <span>{children}</span>
        <span aria-hidden="true">{children}</span>
      </span>
      <span className="glisse-pastille" aria-hidden="true">
        <span><Fleche /></span>
        <span><Fleche /></span>
      </span>
    </Link>
  );
}

const SIGNES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&@$";

/**
 * Bouton « radar » : des coins de viseur qui s'écartent au survol, une ligne de balayage qui descend
 * en boucle, et chaque lettre qui se brouille un instant, l'une après l'autre.
 */
export function BoutonScan({ href, children, className = "" }: { href: string; children: string; className?: string }) {
  const lettres = useRef<HTMLSpanElement>(null);
  const minuteries = useRef<number[]>([]);

  const brouiller = () => {
    const conteneur = lettres.current;
    if (!conteneur || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    minuteries.current.forEach(clearTimeout);
    minuteries.current = [];
    Array.from(conteneur.children).forEach((noeud, i) => {
      const lettre = noeud as HTMLSpanElement;
      const vraie = lettre.dataset.lettre ?? "";
      if (vraie.trim() === "") return;
      for (let tour = 0; tour < 5; tour++) {
        minuteries.current.push(window.setTimeout(() => {
          lettre.textContent = tour === 4 ? vraie : SIGNES[Math.floor(Math.random() * SIGNES.length)];
          lettre.classList.toggle("brouillee", tour < 4);
        }, i * 28 + tour * 55));
      }
    });
  };

  return (
    <Link href={href} className={`bouton-scan ${className}`} onMouseEnter={brouiller} onFocus={brouiller} aria-label={children}>
      <span className="scan-coin" data-coin="hg" />
      <span className="scan-coin" data-coin="hd" />
      <span className="scan-coin" data-coin="bg" />
      <span className="scan-coin" data-coin="bd" />
      <span className="scan-ligne" />
      <span ref={lettres} className="scan-texte" aria-hidden="true">
        {Array.from(children).map((lettre, i) => (
          <span key={i} data-lettre={lettre}>{lettre === " " ? " " : lettre}</span>
        ))}
      </span>
    </Link>
  );
}
