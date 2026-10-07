import Link from "next/link";
import { JOURS_ESSAI } from "@/lib/produit";

export const metadata = { title: "Votre veille en une minute" };

function Fleche() {
  return (
    <span className="grid size-7 place-items-center rounded-full bg-white text-fond transition-transform duration-500 ease-[cubic-bezier(.22,1,.36,1)] group-hover:rotate-45">
      <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
        <path d="M5 11 11 5M6 5h5v5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function Raccourci({ href, titre, texte, className }: { href: string; titre: string; texte: string; className: string }) {
  return (
    <Link href={href} className={`verre group pointer-events-auto absolute hidden w-56 rounded-2xl p-4 lg:block ${className}`}>
      <span className="flex items-start justify-between gap-3">
        <span className="text-[13px] text-texte-doux">{titre}</span>
        <Fleche />
      </span>
      <span className="mt-3 block text-[15px] leading-snug font-medium text-white">{texte}</span>
    </Link>
  );
}

/**
 * Accueil de l'inscription. Trois rangées de grille : le titre au-dessus, les boutons au milieu,
 * exactement devant la sphère, et une rangée vide de même hauteur que la première en dessous.
 */
export default function PageInscription() {
  return (
    <section className="pointer-events-none relative z-10 grid flex-1 grid-rows-[1fr_auto_1fr] justify-items-center px-5">
      <div className="pointer-events-auto self-end pb-[clamp(20px,3.6svh,36px)] text-center">
        <h1 className="apparition titre-scene sur-sphere leading-[1.04] font-semibold tracking-[-0.035em]">
          Votre veille
          <br />
          en une minute
        </h1>
        <p className="apparition sur-sphere mx-auto mt-[clamp(12px,2svh,20px)] max-w-md text-[15px] leading-relaxed text-texte-doux" style={{ animationDelay: "120ms" }}>
          Donnez votre SIRET : nous regardons ce que votre entreprise a déjà gagné et ce qu&apos;elle vend,
          puis nous préparons votre veille des marchés publics.
        </p>
      </div>

      <div className="apparition pointer-events-auto flex w-full max-w-xs flex-col gap-3 sm:w-auto sm:max-w-none sm:flex-row" style={{ animationDelay: "240ms" }}>
        <Link href="/connexion?mode=creer" className="bouton-principal bouton-ligne">Créer un compte</Link>
        <Link href="/connexion" className="bouton-verre">Se connecter</Link>
      </div>

      <p className="apparition sur-sphere self-start pt-6 text-center text-xs text-texte-doux" style={{ animationDelay: "360ms" }}>
        Essai gratuit de {JOURS_ESSAI} jours. Aucun paiement à l&apos;inscription.
      </p>

      <Raccourci
        href="/renouvellements"
        titre="Renouvellements"
        texte="Les marchés qui seront relancés dans 6 à 12 mois"
        className="bottom-[14%] left-[7%] xl:left-[11%]"
      />
      <Raccourci
        href="/avis"
        titre="Avis publiés"
        texte="Les appels d'offres du BOAMP et de TED, chaque matin"
        className="top-[16%] right-[7%] xl:right-[11%]"
      />
    </section>
  );
}
