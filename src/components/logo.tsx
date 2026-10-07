/**
 * Logo Sonar Public (symbole et nom, texte vectorisé en Sora). Version « sombre » sur les fonds sombres,
 * « clair » sur les fonds clairs, « auto » quand le fond suit le thème du système.
 * La charte demande 24 px de haut au moins.
 */
import Image from "next/image";
import { NOM } from "@/lib/produit";

/** Proportions du dessin (viewBox 252.37 × 48). */
const RAPPORT = 252.37 / 48;

export function Logo({ hauteur = 26, variante = "sombre", className = "" }: {
  hauteur?: number;
  variante?: "sombre" | "clair" | "auto";
  className?: string;
}) {
  const image = (version: "sombre" | "clair", classe = "") => (
    <Image
      src={`/logo/sonar-public-logo-${version}.svg`}
      alt={NOM}
      width={Math.round(hauteur * RAPPORT)}
      height={hauteur}
      // un SVG n'a pas besoin d'être recalculé par le serveur d'images
      unoptimized
      priority
      className={`${classe} ${className}`}
      style={{ height: hauteur, width: "auto" }}
    />
  );
  if (variante !== "auto") return image(variante);
  return (
    <>
      {image("clair", "dark:hidden")}
      {image("sombre", "hidden dark:block")}
    </>
  );
}

/** Symbole seul, épaissi pour les petites tailles (16 px au moins), quand le nom est écrit à côté. */
export function SymboleCompact({ taille = 16, className = "" }: { taille?: number; className?: string }) {
  return (
    <Image
      src="/logo/sonar-public-symbole-compact-sombre.svg"
      alt=""
      aria-hidden="true"
      width={taille}
      height={taille}
      unoptimized
      className={`shrink-0 ${className}`}
    />
  );
}
