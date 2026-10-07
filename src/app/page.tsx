/**
 * Page d'accueil : elle présente le service et ce que le client y gagne, en s'inspirant du site que
 * clo a donné en exemple (animations au défilement, arbre qui pousse, fausse messagerie, curseur).
 * Les animations lourdes sont dans src/components/accueil ; tout s'affiche aussi sans elles.
 */
import Link from "next/link";
import type { CSSProperties } from "react";
import { BoiteMail } from "@/components/accueil/boite-mail";
import { BoutonGlisse, BoutonScan } from "@/components/accueil/boutons";
import { Compteur } from "@/components/accueil/compteur";
import { Curseur } from "@/components/accueil/curseur";
import { Apparait, SectionCollante } from "@/components/accueil/defilement";
import { Navigation } from "@/components/accueil/navigation";
import { Questions } from "@/components/accueil/questions";
import { Reseau } from "@/components/accueil/reseau";
import { SphereLiquide } from "@/components/sphere-liquide";
import { manrope } from "@/lib/polices";
import { JOURS_ESSAI, NOM, PRIX_MENSUEL } from "@/lib/produit";
import "./accueil.css";

export const metadata = {
  description:
    "Les nouveaux appels d'offres publics chaque matin, et les marchés qui seront relancés dans 6 à 12 mois. " +
    "Inscription avec votre seul SIRET.",
};

/** Chiffres de la base au 6 octobre 2026 (3 ans de marchés attribués, voir README). */
const MARCHES = 577253;
const ENTREPRISES = 112032;

/** Teinte entre deux couleurs hexadécimales, t de 0 à 1. */
function entre(de: string, a: string, t: number): string {
  const canal = (c: string, i: number) => parseInt(c.slice(1 + i * 2, 3 + i * 2), 16);
  return `rgb(${[0, 1, 2].map((i) => Math.round(canal(de, i) + (canal(a, i) - canal(de, i)) * t)).join(" ")})`;
}

/**
 * Titre qui s'écrit lettre par lettre à l'ouverture. Les mots ne se coupent pas. `teintes` colore les
 * lettres en dégradé, une couleur chacune : un dégradé « background-clip » ne passe pas sur des lettres animées.
 */
function Lettres({ texte, decalage = 0, teintes }: { texte: string; decalage?: number; teintes?: [string, string] }) {
  const mots = texte.split(" ");
  const total = texte.replaceAll(" ", "").length;
  let n = 0;
  return mots.map((mot, i) => (
    <span key={i} className="inline-block whitespace-nowrap" aria-hidden="true">
      {Array.from(mot).map((lettre, j) => {
        const style = { animationDelay: `${180 + (decalage + n) * 24}ms`, color: teintes && entre(...teintes, n / Math.max(1, total - 1)) };
        n++;
        return <span key={j} className="lettre" style={style}>{lettre}</span>;
      })}
      {i < mots.length - 1 && "\u00a0"}
    </span>
  ));
}

/** Texte qui s'allume mot après mot pendant le défilement (variable --p de la section). */
function Mots({ morceaux }: { morceaux: { texte: string; fort?: boolean }[] }) {
  const mots = morceaux.flatMap((m) => m.texte.split(" ").map((mot) => ({ mot, fort: m.fort })));
  return mots.map((m, i) => (
    <span key={i} className={`mot ${m.fort ? "fort" : ""}`} style={{ "--i": i, "--n": mots.length } as CSSProperties}>
      {m.mot}{" "}
    </span>
  ));
}

/** Points du radar autour de la sphère : angle (degrés), distance (fraction de la sphère), moment d'apparition. */
const POINTS: { angle: number; distance: number; seuil: number; etiquette?: string }[] = [
  { angle: 200, distance: 0.5, seuil: 0.1, etiquette: "Nettoyage · 84 k€" },
  { angle: 338, distance: 0.47, seuil: 0.14, etiquette: "Informatique · 210 k€" },
  { angle: 150, distance: 0.55, seuil: 0.2, etiquette: "Restauration · 1,2 M€" },
  { angle: 20, distance: 0.54, seuil: 0.26, etiquette: "Espaces verts · 46 k€" },
  { angle: 228, distance: 0.6, seuil: 0.3 },
  { angle: 300, distance: 0.62, seuil: 0.33, etiquette: "Formation · 30 k€" },
  { angle: 176, distance: 0.42, seuil: 0.36 },
  { angle: 52, distance: 0.46, seuil: 0.39, etiquette: "Sécurité · 390 k€" },
  { angle: 260, distance: 0.48, seuil: 0.42 },
  { angle: 110, distance: 0.5, seuil: 0.45 },
  { angle: 8, distance: 0.4, seuil: 0.48 },
  { angle: 318, distance: 0.38, seuil: 0.5 },
  { angle: 132, distance: 0.62, seuil: 0.53 },
  { angle: 240, distance: 0.4, seuil: 0.56 },
  { angle: 75, distance: 0.6, seuil: 0.58 },
  { angle: 190, distance: 0.64, seuil: 0.6 },
  { angle: 350, distance: 0.6, seuil: 0.63 },
  { angle: 280, distance: 0.56, seuil: 0.66 },
  { angle: 40, distance: 0.63, seuil: 0.69 },
  { angle: 160, distance: 0.36, seuil: 0.72 },
];

const GAINS = [
  {
    chiffre: "6 à 12 mois",
    titre: "d'avance sur les marchés qui reviennent",
    texte: "Quand un marché que vous pouvez gagner arrive à échéance, vous le savez avant sa relance : le temps de rencontrer l'acheteur et de préparer une offre qui gagne.",
  },
  {
    chiffre: "1 courriel",
    titre: "le matin, au lieu d'une heure de recherche",
    texte: "Les avis du BOAMP et de TED qui vous concernent arrivent triés dans votre boîte. Vous ne fouillez plus les sites d'annonces.",
  },
  {
    chiffre: "0 mot-clé",
    titre: "à régler : votre SIRET suffit",
    texte: "Nous lisons votre activité et les marchés que vous avez déjà gagnés, puis nous réglons votre veille. Vous l'ajustez quand vous voulez.",
  },
];

const METIERS = [
  "Nettoyage", "Informatique", "Travaux", "Restauration", "Conseil", "Formation", "Transport", "Sécurité",
  "Espaces verts", "Fournitures", "Énergie", "Communication", "Maintenance", "Santé", "Ingénierie", "Événementiel",
  "Imprimerie", "Mobilier",
];

const INCLUS = [
  "Les appels d'offres du BOAMP et de TED, chaque matin",
  "Les marchés qui reviennent, 6 à 12 mois avant",
  "La fiche de chaque acheteur et de chaque concurrent",
  "Une veille réglée avec votre seul SIRET",
  `${JOURS_ESSAI} jours gratuits, sans carte bancaire`,
];

const QUESTIONS = [
  {
    question: "D'où viennent les données ?",
    reponse: "Des sources publiques officielles : le BOAMP, le Journal officiel de l'Union européenne (TED) et les " +
      "données essentielles de la commande publique publiées par l'État.",
  },
  {
    question: "Pour quels métiers ?",
    reponse: "Tous : travaux, services, fournitures, informatique, conseil. La veille s'adapte à votre activité à " +
      "partir de votre SIRET.",
  },
  {
    question: "Combien de temps pour démarrer ?",
    reponse: "Une minute : votre SIRET, votre adresse et un mot de passe. Votre veille est prête tout de suite, et " +
      "vos alertes arrivent ensuite chaque matin.",
  },
  {
    question: "Que se passe-t-il après l'essai ?",
    reponse: `Rien sans votre accord. À la fin des ${JOURS_ESSAI} jours, vous choisissez de vous abonner ` +
      `(${PRIX_MENSUEL} € HT par mois, sans engagement) ou d'en rester là.`,
  },
  {
    question: "Mes données sont-elles protégées ?",
    reponse: "Nous n'utilisons votre SIRET que pour régler vos alertes, et votre adresse que pour vous les envoyer. " +
      "Les données sont hébergées dans l'Union européenne.",
  },
];

function Coche() {
  return (
    <svg viewBox="0 0 16 16" className="mt-0.5 size-4 shrink-0 text-[#aab6ff]" aria-hidden="true">
      <path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Accueil() {
  return (
    <div className={`${manrope.className} vitrine`}>
      {/* sans JavaScript, tout s'affiche d'emblée */}
      <noscript dangerouslySetInnerHTML={{ __html: "<style>.entree,.mot{opacity:1!important;transform:none!important;filter:none!important}</style>" }} />
      <Curseur />
      <Navigation />

      <SectionCollante hauteur="210svh" className="heros">
        <div className="heros-cadre">
          <div className="scene heros-scene">
            <div className="radar-anneaux" aria-hidden="true">
              <span />
              <span />
              <span />
              <span className="radar-balayage" />
            </div>
            <div className="sphere-cadre heros-sphere pointer-events-none">
              <SphereLiquide className="pointer-events-auto" amplitude={60} ondulations={70} reflet="#C8D0FF" />
            </div>
            <ul className="radar-points" aria-hidden="true">
              {POINTS.map((p) => {
                const a = (p.angle * Math.PI) / 180;
                return (
                  <li
                    key={p.angle}
                    style={{
                      left: `calc(50% + ${(Math.cos(a) * p.distance).toFixed(3)} * var(--cote))`,
                      top: `calc(50% + ${(Math.sin(a) * p.distance * 0.72).toFixed(3)} * var(--cote))`,
                      "--seuil": p.seuil,
                    } as CSSProperties}
                  >
                    {p.etiquette && <span className={Math.cos(a) < 0 ? "a-gauche" : ""}>{p.etiquette}</span>}
                  </li>
                );
              })}
            </ul>

            <div className="heros-contenu">
              <div className="self-end pb-[clamp(18px,3svh,32px)] text-center">
                <p className="apparition pastille-info">
                  <span><span className="hidden sm:inline">Appels d&apos;offres publics · </span>BOAMP, TED et données de l&apos;État</span>
                </p>
                <h1 className="titre-vitrine sur-sphere mt-5" aria-label="Les marchés publics, avant tout le monde.">
                  <Lettres texte="Les marchés publics," />
                  <br />
                  <Lettres texte="avant tout le monde." decalage={20} teintes={["#e4e7ff", "#a493ff"]} />
                </h1>
                <p className="apparition sur-sphere mx-auto mt-[clamp(12px,2svh,20px)] max-w-lg text-[15px] leading-relaxed text-[#b4b4c2] sm:text-base" style={{ animationDelay: "700ms" }}>
                  Chaque matin, les appels d&apos;offres faits pour vous. Six à douze mois avant, les marchés qui
                  vont revenir. Il suffit de votre SIRET.
                </p>
              </div>
              <div className="apparition flex w-full max-w-xs flex-col items-stretch gap-3 sm:w-auto sm:max-w-none sm:flex-row sm:items-center" style={{ animationDelay: "850ms" }}>
                <BoutonGlisse href="/connexion?mode=creer">Créer mon compte gratuit</BoutonGlisse>
                <BoutonScan href="#reseau">Voir comment ça marche</BoutonScan>
              </div>
              <p className="apparition sur-sphere self-start pt-6 text-center text-xs text-[#a3a3b2]" style={{ animationDelay: "1000ms" }}>
                {JOURS_ESSAI} jours gratuits · sans carte bancaire · puis {PRIX_MENSUEL} € HT par mois
              </p>
            </div>

            <div className="heros-suite" aria-hidden="true">
              <p className="text-[clamp(44px,9vw,120px)] leading-none font-medium tracking-[-0.045em] tabular-nums">
                {new Intl.NumberFormat("fr-FR").format(MARCHES)}
              </p>
              <p className="mt-4 text-lg text-[#c9c9d4] sm:text-xl">marchés publics passés au radar, et chaque avis du jour.</p>
            </div>

            <p className="indice-defilement" aria-hidden="true">Faites défiler</p>
          </div>
        </div>
      </SectionCollante>

      <SectionCollante hauteur="170svh" interieur="grid place-items-center px-6">
        <div className="mx-auto max-w-5xl">
          <p className="surtitre">Le problème</p>
          <p className="mt-6 text-[clamp(28px,4.4vw,58px)] leading-[1.12] font-medium tracking-[-0.035em]">
            <Mots
              morceaux={[
                { texte: "Quand un appel d'offres paraît, il reste souvent" },
                { texte: "un mois", fort: true },
                { texte: "pour répondre. Le titulaire sortant, lui, s'y prépare" },
                { texte: "depuis un an.", fort: true },
              ]}
            />
          </p>
          <p className="probleme-suite mt-8 max-w-2xl text-[17px] leading-relaxed text-[#a3a3b2]">
            Chaque marché attribué a une date de fin. C&apos;est public, mais personne ne vous la met sous les yeux.
            Nous, si.
          </p>
        </div>
      </SectionCollante>

      <Reseau />

      <section id="alertes" className="relative px-5 py-28 sm:py-36">
        <div className="mx-auto max-w-6xl">
          <Apparait className="mx-auto max-w-2xl text-center">
            <p className="surtitre">Vos alertes</p>
            <h2 className="titre-section mt-4">Tout arrive dans votre boîte mail.</h2>
            <p className="mt-5 text-[17px] leading-relaxed text-[#a3a3b2]">
              Pas de nouveau logiciel à ouvrir : un courriel le matin, quand il y a du nouveau pour vous. Regardez-les arriver.
            </p>
          </Apparait>
          <Apparait className="mt-14" delai={120}>
            <BoiteMail />
            <p className="mt-4 text-center text-xs text-[#6b6b7a]">Exemple d&apos;une entreprise de nettoyage. Acheteurs, entreprises et montants fictifs.</p>
          </Apparait>
        </div>
      </section>

      <section className="relative px-5 py-28 sm:py-36">
        <div className="mx-auto max-w-6xl">
          <Apparait className="max-w-2xl">
            <p className="surtitre">Ce que vous y gagnez</p>
            <h2 className="titre-section mt-4">Du temps chaque matin, et surtout de l&apos;avance.</h2>
          </Apparait>
          <div className="mt-14 grid gap-4 md:grid-cols-2">
            {GAINS.map((g, i) => (
              <Apparait key={g.chiffre} delai={i * 90} className="carte-gain">
                <p className="chiffre-gain">{g.chiffre}</p>
                <p className="mt-2 text-[17px] font-medium text-white">{g.titre}</p>
                <p className="mt-3 text-[15px] leading-relaxed text-[#a3a3b2]">{g.texte}</p>
              </Apparait>
            ))}
            <Apparait delai={270} className="carte-gain carte-gain-forte">
              <p className="chiffre-gain"><Compteur valeur={MARCHES} /></p>
              <p className="mt-2 text-[17px] font-medium text-white">marchés analysés pour trouver les vôtres</p>
              <p className="mt-3 text-[15px] leading-relaxed text-[#a3a3b2]">
                Et <Compteur valeur={ENTREPRISES} /> entreprises : ce qu&apos;elles gagnent, chez qui, à quel prix.
                Chaque acheteur et chaque concurrent a sa fiche.
              </p>
            </Apparait>
          </div>
        </div>
      </section>

      <section className="bandeau py-10" aria-label="Pour tous les métiers">
        {[0, 1].map((rang) => (
          <div key={rang} className="bandeau-rang" data-sens={rang === 0 ? "gauche" : "droite"} aria-hidden={rang === 1}>
            {[0, 1].map((copie) => (
              <ul key={copie} aria-hidden={copie === 1}>
                {(rang === 0 ? METIERS : [...METIERS].reverse()).map((m) => <li key={m}>{m}</li>)}
              </ul>
            ))}
          </div>
        ))}
      </section>

      <section id="tarif" className="relative px-5 py-28 sm:py-36">
        <Apparait className="mx-auto max-w-xl text-center">
          <p className="surtitre">Tarif fondateur</p>
          <h2 className="titre-section mt-4">Un prix, tout compris.</h2>
        </Apparait>
        <Apparait className="carte-tarif mx-auto mt-12 max-w-xl" delai={120}>
          <p className="flex items-end gap-2">
            <span className="text-[64px] leading-none font-medium tracking-[-0.04em]">{PRIX_MENSUEL} €</span>
            <span className="pb-2 text-[15px] text-[#a3a3b2]">HT par mois, sans engagement</span>
          </p>
          <p className="mt-3 text-[15px] text-[#a3a3b2]">Pour les premières entreprises inscrites.</p>
          <ul className="mt-7 space-y-3 text-[15px] text-[#d8d8e2]">
            {INCLUS.map((ligne) => (
              <li key={ligne} className="flex gap-3"><Coche />{ligne}</li>
            ))}
          </ul>
          <BoutonGlisse href="/connexion?mode=creer" className="mt-9 w-full">Commencer l&apos;essai gratuit</BoutonGlisse>
        </Apparait>
      </section>

      <section id="questions" className="relative px-5 pb-28 sm:pb-36">
        <div className="mx-auto max-w-3xl">
          <Apparait>
            <p className="surtitre">Questions</p>
            <h2 className="titre-section mt-4">Ce qu&apos;on nous demande.</h2>
          </Apparait>
          <Apparait className="mt-10" delai={120}>
            <Questions questions={QUESTIONS} />
          </Apparait>
        </div>
      </section>

      <section className="appel-final relative overflow-hidden px-5 py-32 text-center sm:py-44">
        <div className="radar-anneaux statique" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <Apparait className="relative mx-auto max-w-3xl">
          <h2 className="text-[clamp(36px,6vw,76px)] leading-[1.04] font-medium tracking-[-0.04em]">
            Votre prochain marché est peut-être <span className="degrade whitespace-nowrap">déjà publié.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-lg text-[17px] leading-relaxed text-[#a3a3b2]">
            Donnez votre SIRET : votre veille est prête en une minute, et l&apos;essai dure {JOURS_ESSAI} jours.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <BoutonGlisse href="/connexion?mode=creer">Créer mon compte gratuit</BoutonGlisse>
            <BoutonScan href="/connexion">Se connecter</BoutonScan>
          </div>
        </Apparait>
      </section>

      <footer className="border-t border-white/[0.07] px-5 py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 text-xs text-[#8b8b9a] md:flex-row md:items-center md:justify-between">
          <p>
            <span className="font-semibold text-[#c9c9d4]">{NOM}</span>
            <span className="mt-1 block">Données publiques : BOAMP, TED et données essentielles de la commande publique.</span>
          </p>
          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/avis" className="lien-doux">Avis publiés</Link>
            <Link href="/renouvellements" className="lien-doux">Renouvellements</Link>
            <Link href="/mentions-legales" className="lien-doux">Mentions légales</Link>
            <Link href="/conditions" className="lien-doux">Conditions</Link>
            <Link href="/confidentialite" className="lien-doux">Données personnelles</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
