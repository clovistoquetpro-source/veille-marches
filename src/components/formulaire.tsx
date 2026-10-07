"use client";

/** Pièces des formulaires du nouveau design : champs, bouton d'envoi, message qui se déplie. */
import { useId, useState } from "react";

/** « 34305956400012 » → « 343 059 564 00012 », comme sur un extrait Kbis. Le serveur ne garde que les chiffres. */
export function formaterSiret(saisie: string): string {
  const chiffres = saisie.replace(/\D/g, "").slice(0, 14);
  return [chiffres.slice(0, 3), chiffres.slice(3, 6), chiffres.slice(6, 9), chiffres.slice(9)]
    .filter(Boolean)
    .join(" ");
}

export function Etiquette({ children }: { children: React.ReactNode }) {
  return <span className="text-[13px] text-[#c9c9d4]">{children}</span>;
}

function Chargement() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 animate-spin" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/** Bouton blanc : son texte s'efface en fondu derrière la roue pendant l'envoi. */
export function BoutonEnvoi({ enCours, attente, children }: { enCours: boolean; attente: string; children: React.ReactNode }) {
  return (
    <button disabled={enCours} className="bouton-principal mt-5">
      <span className={`flex items-center justify-center gap-2 transition-opacity duration-300 ${enCours ? "opacity-0" : ""}`}>
        {children}
      </span>
      <span className={`absolute inset-0 flex items-center justify-center gap-2 transition-opacity duration-300 ${enCours ? "" : "opacity-0"}`}>
        <Chargement /> {attente}
      </span>
    </button>
  );
}

/** Erreur ou confirmation : le bloc s'ouvre en douceur au lieu de faire sauter le panneau. */
export function Retour({ erreur, message }: { erreur?: string; message?: string }) {
  const texte = erreur ?? message;
  return (
    <div className={`depliant ${texte ? "ouvert" : ""}`} aria-live="polite">
      <div>
        {texte && (
          <p className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${erreur
            ? "border-red-400/25 bg-red-500/10 text-red-200"
            : "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"}`}>
            {texte}
          </p>
        )}
      </div>
    </div>
  );
}

/** Mot de passe, avec un bouton pour l'afficher en clair. */
export function ChampMotDePasse({ nouveau = false, etiquette, aide }: { nouveau?: boolean; etiquette: string; aide?: string }) {
  const [visible, setVisible] = useState(false);
  const [valeur, setValeur] = useState("");
  const id = useId();
  return (
    <div className="mt-4">
      <label htmlFor={id}><Etiquette>{etiquette}</Etiquette></label>
      <div className="relative mt-2">
        <input
          id={id} name="motDePasse" required type={visible ? "text" : "password"}
          autoComplete={nouveau ? "new-password" : "current-password"} minLength={nouveau ? 8 : undefined}
          value={valeur} onChange={(e) => setValeur(e.target.value)} className="champ h-12 pr-24"
          placeholder={nouveau ? "8 caractères minimum" : "Votre mot de passe"}
        />
        <button
          type="button" onClick={() => setVisible((v) => !v)} aria-pressed={visible}
          aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          className="lien-doux absolute inset-y-0 right-0 px-4 text-[13px] text-[#a3a3b2]"
        >
          {visible ? "Masquer" : "Afficher"}
        </button>
      </div>
      {aide && <span className="mt-2 block text-xs text-[#8b8b9a]">{aide}</span>}
    </div>
  );
}
