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
  adresse?: string | null;
  nom_commercial?: string | null;
  liste_enseignes?: string[] | null;
};
type Resultat = {
  siren: string;
  nom_complet?: string | null;
  nom_raison_sociale?: string | null;
  activite_principale?: string | null;
  etat_administratif?: string | null;
  nature_juridique?: string | null;
  categorie_entreprise?: string | null;
  tranche_effectif_salarie?: string | null;
  date_creation?: string | null;
  finances?: Record<string, { ca?: number | null }> | null;
  siege?: Etablissement | null;
  matching_etablissements?: Etablissement[] | null;
};

/** L'annuaire n'a pas répondu (panne, limite de débit) : ce n'est pas la même chose qu'un numéro inconnu. */
export const INDISPONIBLE = "indisponible";

/**
 * Interroge l'annuaire sur un numéro déjà nettoyé. Renvoie null si l'annuaire ne connaît pas le numéro,
 * et `INDISPONIBLE` s'il ne répond toujours pas après `essais` tentatives.
 */
async function interroger(numero: string, essais: number): Promise<Resultat | null | typeof INDISPONIBLE> {
  const url = `${RECHERCHE}?q=${numero}&per_page=1&minimal=false`;
  let resultat: Resultat | undefined;
  let panne = "";
  for (let essai = 1; ; essai++) {
    try {
      const reponse = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (reponse.ok) {
        resultat = ((await reponse.json()) as { results?: Resultat[] }).results?.[0];
        break;
      }
      // au-delà de 7 requêtes par seconde, l'API répond 429 : on réessaie un peu plus tard, comme sur une panne
      if (reponse.status !== 429 && reponse.status < 500) return null;
      panne = `erreur ${reponse.status}`;
    } catch (erreur) {
      // coupure réseau ou délai dépassé : on réessaie
      panne = String(erreur);
    }
    if (essai >= essais) {
      // visible dans les journaux du Worker, pour distinguer une limite de débit d'une coupure
      console.warn(`Annuaire des entreprises indisponible après ${essais} essais : ${panne}`);
      return INDISPONIBLE;
    }
    await new Promise((r) => setTimeout(r, 1000 * essai));
  }
  if (!resultat || resultat.siren !== numero.slice(0, 9)) return null;
  return resultat;
}

/** L'établissement demandé par son SIRET, ou le siège pour un SIREN. */
function etablissementDemande(resultat: Resultat, numero: string): Etablissement | null | undefined {
  return numero.length === 14
    ? resultat.matching_etablissements?.find((e) => e.siret === numero) ?? resultat.siege
    : resultat.siege;
}

/**
 * Cherche un SIREN (9 chiffres) ou un SIRET (14 chiffres). Renvoie null si l'annuaire ne connaît pas
 * le numéro, et `INDISPONIBLE` s'il ne répond toujours pas après `essais` tentatives.
 */
export async function chercherEntreprise(
  identifiant: string,
  essais = 3,
): Promise<FicheAnnuaire | null | typeof INDISPONIBLE> {
  const numero = identifiant.replace(/\D/g, "");
  if (numero.length !== 9 && numero.length !== 14) return null;
  const resultat = await interroger(numero, essais);
  if (resultat === null || resultat === INDISPONIBLE) return resultat;
  const etablissement = etablissementDemande(resultat, numero);
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

/** Ce que l'annuaire sait d'une entreprise pour remplir ses formulaires de candidature (DC1, DC2). */
export type IdentiteAnnuaire = {
  siren: string;
  siret: string | null;
  nom: string | null;
  /** Nom commercial ou première enseigne de l'établissement. */
  enseigne: string | null;
  adresse: string | null;
  /** Adresse du siège, quand l'établissement demandé n'est pas le siège. */
  adresse_siege: string | null;
  /** Code de catégorie juridique Insee : « 5710 » pour une SAS. */
  categorie_juridique: string | null;
  /** PME, ETI ou GE au sens de l'Insee. */
  categorie: string | null;
  naf: string | null;
  tranche_effectif: string | null;
  date_creation: string | null;
  /** Chiffres d'affaires publiés, de l'exercice le plus récent au plus ancien. */
  chiffres_affaires: { annee: string; ca: number }[];
};

export async function chercherIdentite(
  identifiant: string,
  essais = 2,
): Promise<IdentiteAnnuaire | null | typeof INDISPONIBLE> {
  const numero = identifiant.replace(/\D/g, "");
  if (numero.length !== 9 && numero.length !== 14) return null;
  const resultat = await interroger(numero, essais);
  if (resultat === null || resultat === INDISPONIBLE) return resultat;
  const etablissement = etablissementDemande(resultat, numero);
  const siret = numero.length === 14 ? numero : etablissement?.siret ?? null;
  const siege = resultat.siege;
  return {
    siren: resultat.siren,
    siret,
    nom: resultat.nom_raison_sociale ?? resultat.nom_complet ?? null,
    enseigne: etablissement?.nom_commercial ?? etablissement?.liste_enseignes?.[0] ?? null,
    adresse: etablissement?.adresse ?? siege?.adresse ?? null,
    adresse_siege: siege?.siret && siret && siege.siret !== siret ? siege.adresse ?? null : null,
    categorie_juridique: resultat.nature_juridique ?? null,
    categorie: resultat.categorie_entreprise ?? null,
    naf: resultat.activite_principale ?? null,
    tranche_effectif: resultat.tranche_effectif_salarie ?? null,
    date_creation: resultat.date_creation ?? null,
    chiffres_affaires: Object.entries(resultat.finances ?? {})
      // un chiffre d'affaires à 0 veut dire « comptes non publiés », pas une entreprise sans activité
      .filter((e): e is [string, { ca: number }] => typeof e[1]?.ca === "number" && e[1].ca > 0)
      .map(([annee, f]) => ({ annee, ca: f.ca }))
      .sort((a, b) => b.annee.localeCompare(a.annee)),
  };
}
