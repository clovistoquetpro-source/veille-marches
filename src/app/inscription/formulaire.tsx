"use client";

import { useActionState } from "react";
import { actionInscription, type EtatInscription } from "./actions";

export function Formulaire() {
  const [etat, envoyer, enCours] = useActionState<EtatInscription, FormData>(actionInscription, {});
  return (
    <form action={envoyer} className="mt-6 space-y-4">
      <label className="block">
        <span className="text-sm font-medium">SIRET de votre entreprise</span>
        <input
          name="siret" required inputMode="numeric" placeholder="482 818 523 00029"
          className="mt-1 w-full rounded border px-3 py-2"
        />
        <span className="text-xs text-gray-500">14 chiffres, sur vos factures. Un SIREN à 9 chiffres suffit aussi.</span>
      </label>
      <label className="block">
        <span className="text-sm font-medium">Votre adresse électronique</span>
        <input
          type="email" name="email" required placeholder="vous@entreprise.fr"
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </label>
      {etat.erreur && <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{etat.erreur}</p>}
      <button disabled={enCours} className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50">
        {enCours ? "Nous préparons votre veille…" : "Voir ma veille"}
      </button>
    </form>
  );
}
