import Link from "next/link";

/** Lien vers la fiche d'un acheteur, ou son nom seul si on n'a pas son SIRET. */
export function LienAcheteur({ siret, nom }: { siret: string | null; nom: string | null }) {
  const texte = nom ?? (siret ? `Acheteur ${siret}` : "Acheteur inconnu");
  return siret ? <Link href={`/acheteurs/${siret}`} className="underline decoration-gray-300 hover:decoration-gray-900">{texte}</Link> : <>{texte}</>;
}

/** Lien vers la fiche d'une entreprise, ou son nom seul si on n'a pas son SIREN. */
export function LienEntreprise({ siren, nom, id }: { siren: string | null; nom: string | null; id?: string | null }) {
  const texte = nom ?? id ?? (siren ? `Entreprise ${siren}` : "Titulaire inconnu");
  return siren ? <Link href={`/entreprises/${siren}`} className="underline decoration-gray-300 hover:decoration-gray-900">{texte}</Link> : <>{texte}</>;
}

/** Liste de titulaires séparés par des virgules. */
export function ListeTitulaires({ titulaires }: { titulaires: { siren: string | null; nom: string | null; id?: string | null }[] }) {
  if (titulaires.length === 0) return <span className="text-gray-500">?</span>;
  return (
    <>
      {titulaires.map((t, i) => (
        <span key={`${t.siren ?? t.id ?? t.nom}-${i}`}>
          {i > 0 && ", "}
          <LienEntreprise siren={t.siren} nom={t.nom} id={t.id} />
        </span>
      ))}
    </>
  );
}
