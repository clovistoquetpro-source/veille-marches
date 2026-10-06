"use client";

import { useActionState } from "react";
import { actionPaiement, type EtatPaiement } from "./actions";

export function BoutonPaiement({ actif }: { actif: boolean }) {
  const [etat, envoyer, enCours] = useActionState<EtatPaiement, FormData>(actionPaiement, {});
  return (
    <form action={envoyer} className="mt-4">
      {etat.erreur && <p className="mb-3 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">{etat.erreur}</p>}
      <button disabled={enCours} className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50">
        {enCours ? "Ouverture du paiement…" : actif ? "Changer de moyen de paiement" : "M'abonner"}
      </button>
    </form>
  );
}
