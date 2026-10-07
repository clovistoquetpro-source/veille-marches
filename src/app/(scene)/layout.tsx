/**
 * Scène commune à l'accueil de l'inscription et aux pages de connexion : fond sombre plein écran,
 * sphère liquide au centre. Elle reste en place d'une page à l'autre, seule la partie centrale change.
 * L'en-tête et le pied ont la même hauteur : le centre de la partie centrale est celui de la sphère.
 */
import Link from "next/link";
import { SphereLiquide } from "@/components/sphere-liquide";
import { manrope } from "@/lib/polices";
import { NOM } from "@/lib/produit";

export default function LayoutScene({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${manrope.className} scene-fond min-h-svh p-3 text-[#f4f4f6] sm:p-4`}>
      <main className="scene relative isolate flex min-h-[calc(100svh-1.5rem)] flex-col overflow-hidden rounded-[28px] sm:min-h-[calc(100svh-2rem)]">
        <div className="sphere-cadre pointer-events-none">
          {/* plus calme que le préréglage d'origine (160 / 125) : la surface ondule sans grésiller, et des
              reflets un peu bleutés laissent lire les textes posés dessus */}
          <SphereLiquide className="pointer-events-auto" amplitude={60} ondulations={70} reflet="#C8D0FF" />
        </div>

        <nav className="relative z-10 flex h-[clamp(60px,9svh,76px)] shrink-0 items-center gap-4 px-5 sm:gap-8 sm:px-10">
          <Link href="/" className="text-[15px] font-semibold tracking-tight whitespace-nowrap sm:text-[17px]">{NOM}</Link>
          <span className="hidden flex-1 justify-center gap-8 text-sm text-[#a3a3b2] md:flex">
            <Link href="/avis" className="lien-doux">Avis publiés</Link>
            <Link href="/renouvellements" className="lien-doux">Renouvellements</Link>
          </span>
          <Link href="/veille" className="pilule-discrete ml-auto shrink-0 whitespace-nowrap md:ml-0">Ma veille</Link>
        </nav>

        {children}

        <footer className="relative z-10 flex h-[clamp(60px,9svh,76px)] shrink-0 flex-wrap content-center justify-center gap-x-6 gap-y-1 px-4 text-xs text-[#8b8b9a]">
          <Link href="/mentions-legales" className="lien-doux">Mentions légales</Link>
          <Link href="/conditions" className="lien-doux">Conditions</Link>
          <Link href="/confidentialite" className="lien-doux">Données personnelles</Link>
          <Link href="/abonnement" className="lien-doux">Abonnement</Link>
        </footer>
      </main>
    </div>
  );
}
