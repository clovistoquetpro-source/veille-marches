"use client";

/**
 * Démonstration des alertes : une fausse messagerie où nos courriels arrivent l'un après l'autre,
 * pendant qu'à gauche chaque fonction s'explique avec son « avant / avec nous ». Elle avance seule, une
 * barre montre le temps restant ; un clic choisit une étape, le survol met en pause. Les courriels
 * reprennent la forme des vrais (voir src/lib/alertes.ts). Exemples fictifs.
 */
import { useEffect, useRef, useState } from "react";
import { NOM } from "@/lib/produit";
import { quandVisible, useMoinsDAnimations } from "./mouvement";

const FONCTIONS = [
  {
    titre: "Les appels d'offres du matin",
    texte: "Chaque matin, les nouveaux avis du BOAMP et de TED qui correspondent à votre activité, et seulement eux.",
    avant: "1 h par jour à fouiller les sites d'annonces",
    apres: "1 courriel à 7 h, déjà trié pour vous",
  },
  {
    titre: "Les marchés qui reviennent",
    texte: "Un marché que vous pouvez gagner arrive à échéance : vous le savez 6 à 12 mois avant sa relance.",
    avant: "Un mois pour répondre quand l'avis paraît",
    apres: "6 à 12 mois pour rencontrer l'acheteur",
  },
  {
    titre: "Ce que gagnent vos concurrents",
    texte: "Suivez les entreprises de votre choix : dès qu'elles remportent un marché, vous êtes prévenu.",
    avant: "Vous l'apprenez des mois plus tard",
    apres: "Vous le savez dans la semaine",
  },
  {
    titre: "La fiche de chaque acheteur",
    texte: "Un clic depuis l'alerte : ce que l'acheteur achète, à qui, à quel prix et à quel rythme.",
    avant: "Des heures dans les données publiques",
    apres: "Une page, prête avant le rendez-vous",
  },
];

const COURRIELS = [
  { jour: "lun.", sujet: "4 appels d'offres", apercu: "Nettoyage des locaux de la mairie · Ville de Montval · réponse avant le 14 nov." },
  { jour: "mar.", sujet: "1 marché à reconquérir et 2 appels d'offres", apercu: "Fin estimée juin 2027 · Agglomération de Belrive · 410 000 €" },
  { jour: "mer.", sujet: "1 marché gagné par vos concurrents", apercu: "Netéo Services : nettoyage des écoles maternelles · 120 000 €" },
];

/** Le courriel ouvert à chaque étape : la fiche acheteur s'ouvre depuis celui de mardi. */
const COURRIEL_DE = [0, 1, 2, 1];
const DUREE = 5200;

function Ligne({ titre, detail }: { titre: string; detail: string }) {
  return (
    <li className="mt-3">
      <span className="text-[13px] font-medium text-[#aab6ff] underline decoration-[#aab6ff]/30 underline-offset-2">{titre}</span>
      <span className="mt-0.5 block text-[12px] leading-snug text-[#8b8b9a]">{detail}</span>
    </li>
  );
}

function Rubrique({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <p className="text-[13px] font-semibold text-white">{titre}</p>
      <ul>{children}</ul>
    </div>
  );
}

function EnTeteCourriel({ sujet, jour }: { sujet: string; jour: string }) {
  return (
    <div className="border-b border-white/[0.07] pb-4">
      <p className="text-[17px] leading-snug font-medium text-white">{sujet}</p>
      <p className="mt-2 flex items-center gap-2 text-[12px] text-[#8b8b9a]">
        <span className="logo-radar petit" aria-hidden="true" />
        <span className="text-[#c9c9d4]">{NOM}</span>
        <span>· {jour} 07:00</span>
      </p>
    </div>
  );
}

/** Ce que montre le volet de lecture à chaque étape. */
function Lecture({ etape }: { etape: number }) {
  if (etape === 0) {
    return (
      <>
        <EnTeteCourriel sujet={COURRIELS[0].sujet} jour="lun." />
        <p className="mt-4 text-[13px] text-[#c9c9d4]">Bonjour, voici ce qui concerne votre entreprise :</p>
        <Rubrique titre="Appels d'offres qui viennent de paraître">
          <Ligne titre="Nettoyage des locaux de la mairie" detail="Ville de Montval · dép. 35 · réponse avant le 14 nov." />
          <Ligne titre="Entretien des vitres des écoles" detail="Ville de Belrive · dép. 44 · réponse avant le 21 nov." />
          <Ligne titre="Nettoyage du centre aquatique" detail="Communauté de communes du Val · dép. 35 · réponse avant le 2 déc." />
        </Rubrique>
        <p className="mt-4 text-[12px] text-[#8b8b9a]">Et 1 autre dans votre veille.</p>
      </>
    );
  }
  if (etape === 1) {
    return (
      <>
        <EnTeteCourriel sujet={COURRIELS[1].sujet} jour="mar." />
        <Rubrique titre="Marchés qui arrivent à échéance dans 6 à 12 mois">
          <li className="mt-3 rounded-2xl border border-[#be9fff]/25 bg-[#be9fff]/[0.07] p-3.5">
            <span className="flex items-center justify-between gap-3">
              <span className="text-[13px] font-medium text-white">Nettoyage des bâtiments communautaires</span>
              <span className="shrink-0 rounded-full bg-[#be9fff]/15 px-2.5 py-1 text-[11px] font-medium text-[#d9c8ff]">relance dans 8 mois</span>
            </span>
            <span className="mt-1.5 block text-[12px] leading-snug text-[#a3a3b2]">
              Fin estimée juin 2027 · Agglomération de Belrive · 3 lots · 410 000 € au total · titulaire actuel : Propreté Ouest
            </span>
            <span className="mt-2.5 inline-block text-[12px] font-medium text-[#d9c8ff]">Voir la fiche de l&apos;acheteur →</span>
          </li>
        </Rubrique>
        <Rubrique titre="Appels d'offres qui viennent de paraître">
          <Ligne titre="Entretien ménager de la médiathèque" detail="Ville de Montval · réponse avant le 18 nov." />
          <Ligne titre="Nettoyage des vestiaires du stade" detail="Ville de Saint-Aubin · réponse avant le 25 nov." />
        </Rubrique>
      </>
    );
  }
  if (etape === 2) {
    return (
      <>
        <EnTeteCourriel sujet={COURRIELS[2].sujet} jour="mer." />
        <Rubrique titre="Ce que vos concurrents viennent de gagner">
          <li className="mt-3 rounded-2xl border border-[#ffaacd]/25 bg-[#ffaacd]/[0.06] p-3.5">
            <span className="text-[13px] font-medium text-white">Netéo Services : nettoyage des écoles maternelles</span>
            <span className="mt-1.5 block text-[12px] leading-snug text-[#a3a3b2]">
              Attribution publiée le 6 oct. · Ville de Montval · 120 000 €
            </span>
            <span className="mt-2.5 block text-[12px] text-[#ffc6dc]">Ce marché reviendra en jeu vers octobre 2029.</span>
          </li>
        </Rubrique>
        <p className="mt-5 text-[12px] leading-relaxed text-[#8b8b9a]">
          Vous suivez 3 concurrents. Leur fiche montre tout ce qu&apos;ils ont gagné, chez qui, et quand ces marchés reviennent.
        </p>
      </>
    );
  }
  const achats = [
    { nom: "Travaux", part: 34 },
    { nom: "Nettoyage", part: 24 },
    { nom: "Informatique", part: 17 },
    { nom: "Espaces verts", part: 13 },
  ];
  return (
    <>
      <p className="text-[11px] tracking-wide text-[#8b8b9a] uppercase">Fiche acheteur · ouverte depuis l&apos;alerte de mardi</p>
      <p className="mt-2 text-[17px] font-medium text-white">Agglomération de Belrive</p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {[["38", "marchés en 3 ans"], ["4,2 M€", "attribués"], ["3 ans", "entre deux appels"]].map(([chiffre, legende]) => (
          <span key={legende} className="rounded-xl bg-white/[0.04] px-3 py-2.5">
            <span className="block text-[15px] font-semibold text-white">{chiffre}</span>
            <span className="block text-[11px] leading-tight text-[#8b8b9a]">{legende}</span>
          </span>
        ))}
      </div>
      <p className="mt-5 text-[13px] font-semibold text-white">Ce qu&apos;elle achète</p>
      <ul className="mt-2 space-y-2">
        {achats.map((a, i) => (
          <li key={a.nom} className="grid grid-cols-[92px_1fr_34px] items-center gap-2 text-[12px] text-[#a3a3b2]">
            {a.nom}
            <span className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <span className="barre-fiche block h-full rounded-full bg-[#6ecdff]" style={{ width: `${a.part * 2.5}%`, animationDelay: `${i * 90}ms` }} />
            </span>
            <span className="text-right">{a.part} %</span>
          </li>
        ))}
      </ul>
      <p className="mt-5 text-[13px] font-semibold text-white">À qui</p>
      <p className="mt-1.5 text-[12px] leading-relaxed text-[#a3a3b2]">Propreté Ouest (5 marchés) · Netéo Services (3) · Clair Net (2)</p>
    </>
  );
}

export function BoiteMail() {
  const zone = useRef<HTMLDivElement>(null);
  const reduit = useMoinsDAnimations();
  const [demarre, setDemarre] = useState(false);
  const [etape, setEtape] = useState(0);
  const [arrives, setArrives] = useState(0);
  const [lus, setLus] = useState<number[]>([]);
  // le dernier courriel arrivé, et s'il est encore annoncé : son texte reste pendant que l'annonce s'efface
  const [annonce, setAnnonce] = useState<{ courriel: number; visible: boolean } | null>(null);
  // change à chaque nouvelle étape : la barre de progression repart de zéro
  const [tour, setTour] = useState(0);

  useEffect(() => (zone.current ? quandVisible(zone.current, () => setDemarre(true), "0px 0px -30% 0px") : undefined), []);

  useEffect(() => {
    if (!demarre) return;
    if (reduit) {
      setArrives(COURRIELS.length);
      return;
    }
    setArrives((n) => Math.max(n, 1));
  }, [demarre, reduit]);

  // le courriel affiché est lu ; un courriel qui vient d'arriver s'annonce en haut de la fenêtre
  const affiche = COURRIEL_DE[etape];
  useEffect(() => {
    if (arrives > affiche) setLus((l) => (l.includes(affiche) ? l : [...l, affiche]));
  }, [affiche, arrives]);
  useEffect(() => {
    if (arrives === 0 || reduit) return;
    setAnnonce({ courriel: arrives - 1, visible: true });
    const minuterie = setTimeout(() => setAnnonce((a) => a && { ...a, visible: false }), 2600);
    return () => clearTimeout(minuterie);
  }, [arrives, reduit]);

  const choisir = (n: number) => {
    setEtape(n);
    setArrives((a) => Math.max(a, Math.min(COURRIEL_DE[n] + 1, COURRIELS.length)));
    setTour((t) => t + 1);
  };
  const suivante = () => choisir((etape + 1) % FONCTIONS.length);

  const nonLus = COURRIELS.slice(0, arrives).filter((_, i) => !lus.includes(i)).length;

  return (
    <div ref={zone} className="demo-alertes grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:gap-10">
      <ol className="flex flex-col gap-2">
        {FONCTIONS.map((f, i) => (
          <li key={f.titre}>
            <button
              type="button" onClick={() => choisir(i)} aria-pressed={i === etape}
              className="fonction w-full rounded-2xl px-5 py-4 text-left" data-actif={i === etape ? "oui" : "non"}
            >
              <span className="flex items-center gap-3">
                <span className="fonction-numero">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-[15px] font-medium text-white">{f.titre}</span>
              </span>
              <span className="depliant ouvert-si-actif">
                <span className="block">
                  <span className="mt-2 block text-[14px] leading-relaxed text-[#a3a3b2]">{f.texte}</span>
                  <span className="mt-3 grid grid-cols-2 gap-2 text-[12px] leading-snug">
                    <span className="rounded-xl bg-white/[0.03] px-3 py-2 text-[#8b8b9a]">
                      <span className="block text-[10px] tracking-wider uppercase">Avant</span>
                      {f.avant}
                    </span>
                    <span className="rounded-xl bg-[#8b9bff]/10 px-3 py-2 text-[#d4d9ff]">
                      <span className="block text-[10px] tracking-wider text-[#aab6ff] uppercase">Avec nous</span>
                      {f.apres}
                    </span>
                  </span>
                </span>
              </span>
              {demarre && !reduit && i === etape && (
                <span className="fonction-barre" aria-hidden="true">
                  <span key={tour} style={{ animationDuration: `${DUREE}ms` }} onAnimationEnd={suivante} />
                </span>
              )}
            </button>
          </li>
        ))}
      </ol>

      <div className="fenetre relative overflow-hidden rounded-[22px]" aria-label="Exemple de boîte de réception avec nos alertes">
        <div className="flex h-10 items-center gap-2 border-b border-white/[0.07] px-4">
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="ml-3 text-[12px] text-[#8b8b9a]">Messagerie</span>
        </div>

        <div className="grid md:h-[480px] md:grid-cols-[230px_minmax(0,1fr)] xl:grid-cols-[150px_230px_minmax(0,1fr)]">
          <div className="hidden border-r border-white/[0.07] p-3 text-[13px] xl:block">
            <p className="flex items-center justify-between rounded-lg bg-white/[0.06] px-2.5 py-2 text-white">
              Réception
              {nonLus > 0 && <span className="rounded-full bg-[#8b9bff] px-1.5 text-[11px] font-semibold text-[#0b0b0f]">{nonLus}</span>}
            </p>
            <p className="px-2.5 py-2 text-[#8b8b9a]">Suivis</p>
            <p className="px-2.5 py-2 text-[#8b8b9a]">Envoyés</p>
          </div>

          <ul className="border-b border-white/[0.07] md:overflow-hidden md:border-r md:border-b-0">
            {arrives === 0 && <li className="px-4 py-6 text-[13px] text-[#6b6b7a]">Aucun nouveau message</li>}
            {COURRIELS.slice(0, arrives).map((c, i) => ({ c, i })).reverse().map(({ c, i }) => (
              <li key={c.sujet} className="arrivee">
                <button
                  type="button" onClick={() => choisir(i)}
                  className={`courriel w-full px-4 py-3 text-left ${affiche === i ? "ouvert" : ""}`}
                >
                  <span className="flex items-center justify-between gap-2 text-[12px]">
                    <span className={`flex items-center gap-1.5 ${lus.includes(i) ? "text-[#a3a3b2]" : "font-semibold text-white"}`}>
                      {!lus.includes(i) && <span className="size-1.5 rounded-full bg-[#8b9bff]" />}
                      {NOM}
                    </span>
                    <span className="text-[#6b6b7a]">{c.jour}</span>
                  </span>
                  <span className={`mt-1 block truncate text-[13px] ${lus.includes(i) ? "text-[#c9c9d4]" : "font-medium text-white"}`}>{c.sujet}</span>
                  <span className="mt-0.5 block truncate text-[12px] text-[#6b6b7a]">{c.apercu}</span>
                </button>
              </li>
            ))}
          </ul>

          <div className="relative min-h-[380px] p-5 sm:p-6">
            {arrives > affiche ? (
              <div key={etape} className="lecture">
                <Lecture etape={etape} />
              </div>
            ) : (
              <p className="text-[13px] text-[#6b6b7a]">Votre première alerte arrive demain matin.</p>
            )}
          </div>
        </div>

        <div className={`annonce ${annonce?.visible ? "visible" : ""}`} aria-live="polite">
          {annonce && (
            <>
              <span className="logo-radar petit" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-[11px] text-[#8b8b9a]">Nouveau message · {NOM}</span>
                <span className="block truncate text-[13px] font-medium text-white">{COURRIELS[annonce.courriel].sujet}</span>
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
