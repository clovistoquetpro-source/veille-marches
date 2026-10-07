"use client";
import { useActionState, useState } from "react";
import { actionInscription, type EtatInscription } from "./actions";

/** « 34305956400012 » → « 343 059 564 00012 », comme sur un extrait Kbis. Le serveur ne garde que les chiffres. */
function formaterSiret(saisie: string): string {
  const chiffres = saisie.replace(/\D/g, "").slice(0, 14);
  return [chiffres.slice(0, 3), chiffres.slice(3, 6), chiffres.slice(6, 9), chiffres.slice(9)]
    .filter(Boolean)
    .join(" ");
}

function Chargement() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 animate-spin" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function Formulaire() {
  const [etat, envoyer, enCours] = useActionState<EtatInscription, FormData>(actionInscription, {});
  // champs contrôlés : React vide les champs libres après chaque envoi, même quand il échoue
  const [siret, setSiret] = useState("");
  const [email, setEmail] = useState("");
  return (
    <form action={envoyer} className="verre rounded-3xl p-5 text-left sm:p-6">
      <label className="block">
        <span className="text-[13px] text-[#c9c9d4]">SIRET de votre entreprise</span>
        <input
          name="siret" required inputMode="numeric" autoComplete="off" placeholder="482 818 523 00029"
          value={siret} onChange={(e) => setSiret(formaterSiret(e.target.value))}
          className="champ mt-2 tabular-nums tracking-wide"
        />
        <span className="mt-2 block text-xs text-[#8b8b9a]">14 chiffres, sur vos factures. Un SIREN à 9 chiffres suffit aussi.</span>
      </label>
      <label className="mt-4 block">
        <span className="text-[13px] text-[#c9c9d4]">Votre adresse électronique</span>
        <input type="email" name="email" required autoComplete="email" placeholder="vous@entreprise.fr"
          value={email} onChange={(e) => setEmail(e.target.value)} className="champ mt-2"
        />
      </label>

      {/* l'erreur s'ouvre en douceur au lieu de faire sauter la page */}
      <div className={`depliant ${etat.erreur ? "ouvert" : ""}`} aria-live="polite">
        <div>
          {etat.erreur && (
            <p className="mt-4 rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">{etat.erreur}</p>
          )}
        </div>
      </div>

      <button disabled={enCours} className="bouton-principal mt-5">
        <span className={`flex items-center justify-center gap-2 transition-opacity duration-300 ${enCours ? "opacity-0" : ""}`}>
          Voir ma veille
        </span>
        <span className={`absolute inset-0 flex items-center justify-center gap-2 transition-opacity duration-300 ${enCours ? "" : "opacity-0"}`}>
          <Chargement /> Nous préparons votre veille…
        </span>
      </button>
      <p className="mt-4 text-center text-xs leading-relaxed text-[#8b8b9a]">
        Votre adresse ne sert qu&apos;à vos alertes. Aucun paiement à l&apos;inscription.
      </p>
    </form>
  );
}
