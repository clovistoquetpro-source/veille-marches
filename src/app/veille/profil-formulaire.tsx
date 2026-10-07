"use client";

import { useActionState, useState } from "react";
import { actionProfil, type EtatProfil } from "./actions";
import { libelleDivision } from "@/lib/nomenclatures";
import type { Profil } from "@/lib/profil";

const ORIGINES: Record<Profil["origine"], string> = {
  historique: "Profil déduit de vos marchés publics déjà gagnés",
  ia: "Profil déduit de votre activité déclarée",
  manuel: "Votre profil de veille",
};

/**
 * Profil de veille, replié quand il rapporte déjà des marchés. Le volet garde son état ouvert ou
 * fermé lorsque la page se recharge après un enregistrement, pour que le client voie sa confirmation.
 */
export function PanneauProfil({ profil, ouvert }: { profil: Profil; ouvert: boolean }) {
  const [ouvre, setOuvre] = useState(ouvert);
  const [etat, envoyer, enCours] = useActionState<EtatProfil, FormData>(actionProfil, {});
  const resume = [
    profil.cpv.length > 0 && `${profil.cpv.length} code${profil.cpv.length > 1 ? "s" : ""} CPV`,
    profil.mots_cles.length > 0 && profil.mots_cles.join(", "),
    profil.departements.length > 0
      ? `département${profil.departements.length > 1 ? "s" : ""} ${profil.departements.join(", ")}`
      : "toute la France",
  ].filter(Boolean).join(" · ");

  return (
    <details className="mt-4 rounded border p-4" open={ouvre} onToggle={(e) => setOuvre(e.currentTarget.open)}>
      <summary className="cursor-pointer text-sm">
        {ORIGINES[profil.origine]}
        <span className="text-gray-600"> · {resume}</span>
      </summary>

      {profil.cpv.length > 0 && (
        <ul className="mt-3 text-sm text-gray-700">
          {profil.cpv.map((c) => <li key={c}>{c} · {libelleDivision(c)}</li>)}
        </ul>
      )}

      <form action={envoyer} className="mt-3 space-y-3 text-sm">
        <label className="block">
          <span className="font-medium">Codes CPV suivis</span>
          <input name="cpv" defaultValue={profil.cpv.join(", ")} className="mt-1 w-full rounded border px-3 py-2" />
          <span className="text-xs text-gray-500">
            Les premiers chiffres suffisent : « 90 » pour tout le nettoyage et l&apos;environnement, « 90910 » pour le nettoyage de locaux.
          </span>
        </label>
        <label className="block">
          <span className="font-medium">Mots-clés</span>
          <input name="mots_cles" defaultValue={profil.mots_cles.join(", ")} className="mt-1 w-full rounded border px-3 py-2" />
          <span className="text-xs text-gray-500">Cherchés dans l&apos;objet de l&apos;avis. Laissez vide si les codes CPV suffisent.</span>
        </label>
        <label className="block">
          <span className="font-medium">Départements</span>
          <input name="departements" defaultValue={profil.departements.join(", ")} className="mt-1 w-full rounded border px-3 py-2" />
          <span className="text-xs text-gray-500">Vide = toute la France.</span>
        </label>
        <label className="block">
          <span className="font-medium">Alertes par courriel</span>
          <select name="frequence" defaultValue={profil.frequence ?? "quotidienne"} className="mt-1 block rounded border px-3 py-2">
            <option value="en_continu">Dès qu&apos;une offre sort (vérifié toutes les 2 h en journée)</option>
            <option value="quotidienne">Chaque matin à 7 h</option>
            <option value="hebdomadaire">Une fois par semaine, le lundi</option>
            <option value="aucune">Aucune alerte</option>
          </select>
        </label>
        {etat.erreur && <p className="rounded border border-red-300 bg-red-50 p-2 text-red-800">{etat.erreur}</p>}
        {etat.message && <p className="rounded border border-green-300 bg-green-50 p-2 text-green-800">{etat.message}</p>}
        <button disabled={enCours} className="rounded bg-gray-900 px-3 py-1.5 text-white disabled:opacity-50">
          {enCours ? "Enregistrement…" : "Enregistrer"}
        </button>
      </form>
    </details>
  );
}
