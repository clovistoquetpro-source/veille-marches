"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const MO = 1024 * 1024;

/** Dépôt des PDF du dossier puis lancement de l'analyse ; mène à la page du résultat. */
export function AnalyseDossier({ uid, tailleMax, fichiersMax }: { uid: string; tailleMax: number; fichiersMax: number }) {
  const router = useRouter();
  const [fichiers, setFichiers] = useState<File[]>([]);
  const [etat, setEtat] = useState<string | null>(null);
  /** Choix de fichiers refusé (trop gros, pas un PDF…). */
  const [invalide, setInvalide] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const occupe = etat !== null;
  const base = `/candidature/${encodeURIComponent(uid)}`;

  function choisir(liste: FileList | null) {
    const choisis = [...(liste ?? [])];
    setErreur(null);
    setInvalide(
      choisis.length > fichiersMax ? `${fichiersMax} fichiers au plus : gardez le règlement de la consultation et les cahiers des charges.`
        : choisis.some((f) => f.size > tailleMax) ? `Un fichier dépasse ${tailleMax / MO} Mo.`
        : choisis.some((f) => !/\.pdf$/i.test(f.name)) ? "Seuls les fichiers PDF sont acceptés pour l'instant."
        : null,
    );
    setFichiers(choisis);
  }

  async function analyser() {
    setErreur(null);
    try {
      const ids: string[] = [];
      for (const fichier of fichiers) {
        setEtat(`Envoi de « ${fichier.name} »…`);
        const formulaire = new FormData();
        formulaire.append("file", fichier, fichier.name);
        const reponse = await fetch(`${base}/fichier`, { method: "POST", body: formulaire });
        const corps = (await reponse.json().catch(() => ({}))) as { id?: string; erreur?: string };
        if (!reponse.ok || !corps.id) throw new Error(corps.erreur ?? "Le fichier n'a pas pu être envoyé.");
        ids.push(corps.id);
      }
      setEtat("L'IA lit le dossier. Comptez une à deux minutes, ne fermez pas la page…");
      const reponse = await fetch(`${base}/analyse`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fichiers: ids }),
      });
      // la réponse arrive au fil de l'eau ; seule sa dernière ligne compte
      const lignes = (await reponse.text()).trim().split("\n");
      const resultat = JSON.parse(lignes[lignes.length - 1] || "{}") as { id?: string; erreur?: string };
      if (!resultat.id) throw new Error(resultat.erreur ?? "L'analyse n'a pas abouti.");
      setEtat("C'est prêt !");
      router.push(`/analyses/${resultat.id}`);
    } catch (e) {
      setEtat(null);
      setErreur(e instanceof Error ? e.message : "Une erreur est survenue.");
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <label className="block">
        <span className="text-gray-600">
          Les PDF du dossier de consultation : règlement de la consultation (RC), CCAP, CCTP ({fichiersMax} fichiers au plus)
        </span>
        <input
          type="file" accept="application/pdf,.pdf" multiple disabled={occupe}
          onChange={(e) => choisir(e.target.files)}
          className="mt-1 block w-full rounded border px-2 py-1.5"
        />
      </label>
      <button
        type="button" onClick={analyser}
        disabled={occupe || fichiers.length === 0 || invalide !== null}
        className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-40"
      >
        {occupe ? "Analyse en cours…" : "Analyser le dossier"}
      </button>
      {etat && <p className="text-gray-700" role="status">{etat}</p>}
      {(invalide ?? erreur) && <p className="text-rose-700" role="alert">{invalide ?? erreur}</p>}
    </div>
  );
}
