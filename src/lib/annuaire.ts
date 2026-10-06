/**
 * Annuaire des entreprises (API publique recherche-entreprises.api.gouv.fr, sans clé) : à
 * l'inscription, le client ne donne que son SIRET et l'annuaire nous rend son nom, son activité et
 * son département. La base Sirene chargée dans le site ne contient que les entreprises déjà vues
 * dans un marché ou un avis : un nouveau client n'y est pas forcément.
 */
import { departementDuCodePostal } from "../ingest/departements";

const RECHERCHE = "https://recherche-entreprises.api.gouv.fr/search";

export type FicheAnnuaire = {
  siren: string;
  /** SIRET de l'établissement demandé, ou du siège. */
  siret: string | null;
  nom: string | null;
  /** Code NAF rév. 2, avec le point : « 81.22Z ». */
  naf: string | null;
  departement: string | null;
  commune: string | null;
  /** false quand l'entreprise est fermée au répertoire Sirene. */
  active: boolean;
};

type Etablissement = {
  siret?: string;
  departement?: string | null;
  code_postal?: string | null;
  libelle_commune?: string | null;
};
type Resultat = {
  siren: string;
  nom_complet?: string | null;
  nom_raison_sociale?: string | null;
  activite_principale?: string | null;
  etat_administratif?: string | null;
  siege?: Etablissement | null;
  matching_etablissements?: Etablissement[] | null;
};

/** Cherche un SIREN (9 chiffres) ou un SIRET (14 chiffres). Renvoie null si l'annuaire ne connaît pas. */
export async function chercherEntreprise(identifiant: string): Promise<FicheAnnuaire | null> {
  const numero = identifiant.replace(/\D/g, "");
  if (numero.length !== 9 && numero.length !== 14) return null;
  const url = `${RECHERCHE}?q=${numero}&per_page=1&minimal=false`;
  let resultat: Resultat | undefined;
  try {
    const reponse = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!reponse.ok) return null;
    const corps = (await reponse.json()) as { results?: Resultat[] };
    resultat = corps.results?.[0];
  } catch {
    return null;
  }
  if (!resultat || resultat.siren !== numero.slice(0, 9)) return null;
  const etablissement = numero.length === 14
    ? resultat.matching_etablissements?.find((e) => e.siret === numero) ?? resultat.siege
    : resultat.siege;
  // les établissements de la recherche par SIRET n'ont pas de champ « departement », mais un code postal
  const departement = etablissement?.departement
    ?? (etablissement?.code_postal ? departementDuCodePostal(etablissement.code_postal) : null)
    ?? resultat.siege?.departement
    ?? null;
  return {
    siren: resultat.siren,
    siret: numero.length === 14 ? numero : etablissement?.siret ?? null,
    nom: resultat.nom_complet ?? resultat.nom_raison_sociale ?? null,
    naf: resultat.activite_principale ?? null,
    departement,
    commune: etablissement?.libelle_commune ?? null,
    active: resultat.etat_administratif !== "C",
  };
}
