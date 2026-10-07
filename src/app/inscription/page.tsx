import { Manrope } from "next/font/google";
import Link from "next/link";
import { SphereLiquide } from "@/components/sphere-liquide";
import { NOM } from "@/lib/produit";
import { Formulaire } from "./formulaire";

export const metadata = { title: "Inscription" };

const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });

function Fleche() {
  return (
    <span className="grid size-7 place-items-center rounded-full bg-white text-[#0b0b0f] transition-transform duration-500 ease-[cubic-bezier(.22,1,.36,1)] group-hover:rotate-45">
      <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
        <path d="M5 11 11 5M6 5h5v5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function Raccourci({ href, titre, texte, className }: { href: string; titre: string; texte: string; className: string }) {
  return (
    <Link href={href} className={`verre group absolute z-10 hidden w-56 rounded-2xl p-4 lg:block ${className}`}>
      <span className="flex items-start justify-between gap-3">
        <span className="text-[13px] text-[#a3a3b2]">{titre}</span>
        <Fleche />
      </span>
      <span className="mt-3 block text-[15px] leading-snug font-medium text-white">{texte}</span>
    </Link>
  );
}

export default function PageInscription() {
  return (
    <div className={`${manrope.className} scene-fond min-h-svh p-3 text-[#f4f4f6] sm:p-4`}>
      <main className="scene relative isolate flex min-h-[calc(100svh-1.5rem)] flex-col overflow-hidden rounded-[28px] sm:min-h-[calc(100svh-2rem)]">
        <nav className="relative z-10 flex items-center gap-4 px-5 py-5 sm:gap-8 sm:px-10">
          <Link href="/" className="text-[15px] font-semibold tracking-tight whitespace-nowrap sm:text-[17px]">{NOM}</Link>
          <span className="hidden flex-1 justify-center gap-8 text-sm text-[#a3a3b2] md:flex">
            <Link href="/avis" className="lien-doux">Avis publiés</Link>
            <Link href="/renouvellements" className="lien-doux">Renouvellements</Link>
          </span>
          <Link href="/veille" className="pilule-discrete ml-auto shrink-0 whitespace-nowrap md:ml-0">Ma veille</Link>
        </nav>

        <section className="contenu relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col items-center px-5 pt-10 text-center sm:pt-16">
          <h1 className="apparition text-[44px] leading-[1.04] font-medium tracking-[-0.035em] sm:text-[64px]">
            Votre veille
            <br />
            en une minute
          </h1>
          <p className="apparition mt-5 max-w-sm text-[15px] leading-relaxed text-[#a3a3b2]" style={{ animationDelay: "120ms" }}>
            Donnez votre SIRET. Nous regardons ce que votre entreprise a déjà gagné et ce qu&apos;elle vend,
            puis nous préparons votre veille. Vous pourrez tout corriger ensuite.
          </p>
          <div className="apparition mt-9 w-full" style={{ animationDelay: "240ms" }}>
            <Formulaire />
          </div>
        </section>

        <Raccourci
          href="/renouvellements"
          titre="Renouvellements"
          texte="Les marchés qui seront relancés dans 6 à 12 mois"
          className="bottom-[22%] left-[8%] xl:left-[14%]"
        />
        <Raccourci
          href="/avis"
          titre="Avis publiés"
          texte="Les appels d'offres du BOAMP et de TED, chaque matin"
          className="right-[8%] bottom-[12%] xl:right-[14%]"
        />

        <div className="sphere-cadre pointer-events-none absolute inset-0 -z-0">
          {/* réglages plus calmes que le préréglage d'origine (160 / 125) : la surface ondule sans grésiller */}
          <SphereLiquide className="pointer-events-auto" amplitude={60} ondulations={70} />
        </div>
      </main>

      <footer className="flex flex-wrap justify-center gap-x-6 gap-y-2 px-4 py-5 text-xs text-[#8b8b9a]">
        <Link href="/mentions-legales" className="lien-doux">Mentions légales</Link>
        <Link href="/conditions" className="lien-doux">Conditions</Link>
        <Link href="/confidentialite" className="lien-doux">Données personnelles</Link>
        <Link href="/abonnement" className="lien-doux">Abonnement</Link>
      </footer>
    </div>
  );
}
