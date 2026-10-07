"use client";

/**
 * Panneau de connexion : « Se connecter », « Créer un compte » et « Mot de passe oublié » sont trois
 * volets empilés. Changer de volet fait glisser la pastille, fond l'ancien volet dans le nouveau et
 * ajuste la hauteur du panneau en douceur. L'adresse saisie suit d'un volet à l'autre.
 */
import { useActionState, useLayoutEffect, useRef, useState } from "react";
import { BoutonEnvoi, ChampMotDePasse, Etiquette, formaterSiret, Retour } from "@/components/formulaire";
import { actionConnexion, actionCreation, actionOubli, type EtatFormulaire } from "./actions";

export type Mode = "connexion" | "creer" | "oubli";

function Titre({ titre, texte }: { titre: string; texte: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-[26px] leading-tight police-titre font-semibold tracking-[-0.02em]">{titre}</h1>
      <p className="mt-1.5 text-sm text-texte-doux">{texte}</p>
    </div>
  );
}

function ChampEmail({ email, setEmail }: { email: string; setEmail: (v: string) => void }) {
  return (
    <label className="block">
      <Etiquette>Adresse électronique</Etiquette>
      <input
        type="email" name="email" required autoComplete="email" placeholder="vous@entreprise.fr"
        value={email} onChange={(e) => setEmail(e.target.value)} className="champ mt-2 h-12"
      />
    </label>
  );
}

export function Panneau({ modeInitial }: { modeInitial: Mode }) {
  const [mode, setMode] = useState<Mode>(modeInitial);
  const [email, setEmail] = useState("");
  const [siret, setSiret] = useState("");
  const [etatConnexion, connexion, connexionEnCours] = useActionState<EtatFormulaire, FormData>(actionConnexion, {});
  const [etatCreation, creation, creationEnCours] = useActionState<EtatFormulaire, FormData>(actionCreation, {});
  const [etatOubli, oubli, oubliEnCours] = useActionState<EtatFormulaire, FormData>(actionOubli, {});

  // la hauteur suit celle du volet affiché, y compris quand un message s'y déplie
  const volets = { connexion: useRef<HTMLDivElement>(null), creer: useRef<HTMLDivElement>(null), oubli: useRef<HTMLDivElement>(null) };
  const [hauteur, setHauteur] = useState<number>();
  const actif = volets[mode];
  useLayoutEffect(() => {
    const volet = actif.current;
    if (!volet) return;
    // + 12 : la marge intérieure de .volets, qui laisse voir les halos de focus
    const mesurer = () => setHauteur(volet.offsetHeight + 12);
    mesurer();
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(volet);
    return () => observateur.disconnect();
  }, [actif]);

  const choisir = (suivant: Mode) => {
    setMode(suivant);
    // l'adresse de la page garde le volet : un rechargement ou un lien partagé y ramène
    window.history.replaceState(null, "", suivant === "connexion" ? "/connexion" : `/connexion?mode=${suivant}`);
  };
  const attributs = (m: Mode) => ({ ref: volets[m], "data-actif": mode === m ? "oui" : "non", inert: mode !== m, className: "volet" });

  return (
    <div className="verre verre-dense rounded-[28px] p-5 sm:p-7">
      <div className="bascule mb-6" data-choix={mode === "creer" ? "creer" : "connexion"}>
        <button type="button" aria-pressed={mode !== "creer"} onClick={() => choisir("connexion")}>Se connecter</button>
        <button type="button" aria-pressed={mode === "creer"} onClick={() => choisir("creer")}>Créer un compte</button>
      </div>

      <div className="volets" style={{ height: hauteur }}>
        <div {...attributs("connexion")}>
          <Titre titre="Bon retour" texte="Retrouvez votre veille là où vous l'avez laissée." />
          <form action={connexion}>
            <ChampEmail email={email} setEmail={setEmail} />
            <ChampMotDePasse etiquette="Mot de passe" />
            <div className="mt-3 text-right">
              <button type="button" onClick={() => choisir("oubli")} className="lien-souligne text-[13px] text-texte-doux">
                Mot de passe oublié ?
              </button>
            </div>
            <Retour erreur={etatConnexion.erreur} />
            <BoutonEnvoi enCours={connexionEnCours} attente="Connexion…">Se connecter</BoutonEnvoi>
          </form>
        </div>

        <div {...attributs("creer")}>
          <Titre titre="Créez votre compte" texte="Votre veille est prête en une minute." />
          <form action={creation}>
            <label className="block">
              <span className="flex items-baseline justify-between gap-3">
                <Etiquette>SIRET de votre entreprise</Etiquette>
                <span className="text-xs text-texte-doux">sur vos factures</span>
              </span>
              <input
                name="siret" required inputMode="numeric" autoComplete="off" placeholder="482 818 523 00029"
                title="14 chiffres (SIRET) ou 9 chiffres (SIREN)"
                value={siret} onChange={(e) => setSiret(formaterSiret(e.target.value))}
                className="champ mt-2 h-12 tabular-nums tracking-wide"
              />
            </label>
            <div className="mt-4"><ChampEmail email={email} setEmail={setEmail} /></div>
            <ChampMotDePasse nouveau etiquette="Mot de passe" />
            <Retour erreur={etatCreation.erreur} />
            <BoutonEnvoi enCours={creationEnCours} attente="Nous préparons votre veille…">Créer mon compte</BoutonEnvoi>
            <p className="mt-3 text-center text-xs text-texte-doux">Essai gratuit, aucun paiement à l&apos;inscription.</p>
          </form>
        </div>

        <div {...attributs("oubli")}>
          <Titre titre="Mot de passe oublié" texte="Nous vous envoyons un lien pour en choisir un nouveau." />
          <form action={oubli}>
            <ChampEmail email={email} setEmail={setEmail} />
            <Retour erreur={etatOubli.erreur} message={etatOubli.message} />
            <BoutonEnvoi enCours={oubliEnCours} attente="Envoi…">Recevoir le lien</BoutonEnvoi>
            <div className="mt-4 text-center">
              <button type="button" onClick={() => choisir("connexion")} className="lien-souligne text-[13px] text-texte-doux">
                Retour à la connexion
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
