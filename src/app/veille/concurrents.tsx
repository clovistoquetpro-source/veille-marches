"use client";

import Link from "next/link";
import { useActionState } from "react";
import { actionRechercheConcurrent, actionSuivi, type EtatRecherche, type EtatSuivi } from "./actions";

/** Bouton « Suivre » / « Ne plus suivre » d'une entreprise. */
export function BoutonSuivi({ siren, suivie, petit = false }: { siren: string; suivie: boolean; petit?: boolean }) {
  const [etat, envoyer, enCours] = useActionState<EtatSuivi, FormData>(actionSuivi, {});
  const actuelle = etat.suivie ?? suivie;
  return (
    <form action={envoyer} className="inline-block">
      <input type="hidden" name="siren" value={siren} />
      <input type="hidden" name="suivre" value={actuelle ? "0" : "1"} />
      <button
        disabled={enCours}
        className={actuelle
          ? `rounded border px-3 ${petit ? "py-0.5 text-xs" : "py-1.5 text-sm"} text-gray-700 disabled:opacity-50`
          : `rounded bg-gray-900 px-3 ${petit ? "py-0.5 text-xs" : "py-1.5 text-sm"} text-white disabled:opacity-50`}
      >
        {enCours ? "…" : actuelle ? "Ne plus suivre" : "Suivre"}
      </button>
      {etat.erreur && <span className="ml-2 text-xs text-red-700">{etat.erreur}</span>}
    </form>
  );
}

/** Ajout d'un concurrent par son nom ou son numéro. */
export function RechercheConcurrent() {
  const [etat, envoyer, enCours] = useActionState<EtatRecherche, FormData>(actionRechercheConcurrent, {});
  return (
    <div className="mt-4 rounded border p-4 text-sm">
      <form action={envoyer} className="flex flex-wrap items-end gap-2">
        <label className="grow">
          <span className="font-medium">Ajouter un concurrent</span>
          <input
            name="recherche"
            placeholder="Nom de l'entreprise, SIREN ou SIRET"
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <button disabled={enCours} className="rounded bg-gray-900 px-3 py-2 text-white disabled:opacity-50">
          {enCours ? "Recherche…" : "Chercher"}
        </button>
      </form>
      {etat.erreur && <p className="mt-3 rounded border border-red-300 bg-red-50 p-2 text-red-800">{etat.erreur}</p>}
      {etat.message && <p className="mt-3 rounded border border-green-300 bg-green-50 p-2 text-green-800">{etat.message}</p>}
      {etat.resultats && (
        <ul className="mt-3 divide-y">
          {etat.resultats.map((r) => (
            <li key={r.siren} className="flex items-center justify-between gap-3 py-2">
              <span>
                <Link href={`/entreprises/${r.siren}`} className="underline decoration-gray-300 hover:decoration-gray-900">
                  {r.nom ?? `Entreprise ${r.siren}`}
                </Link>
                <span className="text-gray-600">
                  {" · "}{r.marches} marché{r.marches > 1 ? "s" : ""} chez {r.acheteurs} acheteur{r.acheteurs > 1 ? "s" : ""}
                </span>
              </span>
              <BoutonSuivi siren={r.siren} suivie={r.suivie} petit />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
