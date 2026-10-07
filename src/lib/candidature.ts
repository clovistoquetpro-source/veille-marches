import type postgres from "postgres";
import { chercherIdentite, INDISPONIBLE } from "./annuaire";
import type { Compte } from "./comptes";
import type { Bloc } from "./docx";
import { jour } from "./format";
import { libelleEffectif } from "./nomenclatures";
import { NOM } from "./produit";

/**
 * Pré-remplissage des formulaires de candidature DC1 (lettre de candidature) et DC2 (déclaration du
 * candidat), modèles de la Direction des affaires juridiques du ministère de l'Économie. On reprend
 * leur plan rubrique par rubrique ; on remplit ce que les données publiques disent de l'acheteur et
 * de l'entreprise, et on laisse vides les déclarations sur l'honneur, que seul le client peut faire.
 */

export const VERSION_DC1 = "18/02/2025";
export const VERSION_DC2 = "01/04/2019";
/** Montant exact, sans l'arrondi en millions de l'affichage du site : « 2 400 000 € ». */
const eurosExacts = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export const PAGE_OFFICIELLE = "https://www.economie.gouv.fr/daj/formulaires-declaration-du-candidat";

export type AvisCandidature = {
  uid: string;
  source: "boamp" | "ted";
  numero: string;
  type: string;
  objet: string;
  acheteur_nom: string | null;
  acheteur_siret: string | null;
  famille: string | null;
  date_publication: string;
  date_limite: string | null;
  url: string;
};

export type Candidat = {
  siren: string | null;
  siret: string | null;
  denomination: string | null;
  enseigne: string | null;
  adresse: string | null;
  adresse_siege: string | null;
  forme_juridique: string | null;
  /** Vrai pour une PME au sens de l'Insee, faux pour une ETI ou une grande entreprise, null si on ne sait pas. */
  pme: boolean | null;
  naf: string | null;
  naf_libelle: string | null;
  effectif: string | null;
  date_creation: string | null;
  chiffres_affaires: { annee: string; ca: number }[];
  email: string | null;
  telephone: string | null;
  /** D'où viennent les informations : l'annuaire des entreprises (complet) ou notre base (sans adresse). */
  origine: "annuaire" | "base" | "aucune";
};

export type Lots = { cas: "sans_lots" } | { cas: "tous" } | { cas: "certains"; lots: string };

export async function avisPourCandidature(sql: postgres.Sql, uid: string): Promise<AvisCandidature | null> {
  const [avis] = await sql<AvisCandidature[]>`
    select uid, source, numero, type, objet, acheteur_nom, acheteur_siret, famille,
      date_publication::text as date_publication, date_limite::text as date_limite, url
    from avis where uid = ${uid}`;
  return avis ?? null;
}

async function libelles(sql: postgres.Sql, categorie: string | null, naf: string | null) {
  const [ligne] = await sql<{ forme: string | null; naf: string | null }[]>`
    select (select libelle from categories_juridiques where code = ${categorie ?? ""}) as forme,
      (select libelle from naf where code = ${naf ?? ""}) as naf`;
  return ligne ?? { forme: null, naf: null };
}

function estPme(categorie: string | null): boolean | null {
  if (categorie === "PME") return true;
  if (categorie === "ETI" || categorie === "GE") return false;
  return null;
}

/**
 * Identité de l'entreprise du client. L'annuaire public donne l'adresse et les chiffres d'affaires ;
 * s'il ne répond pas, notre copie du répertoire Sirene donne le reste, sans adresse.
 */
export async function candidatDuCompte(
  sql: postgres.Sql,
  compte: Compte,
  saisie: { telephone?: string | null; email?: string | null } = {},
): Promise<Candidat> {
  const contact = {
    email: saisie.email?.trim() || compte.email,
    telephone: saisie.telephone?.trim() || null,
  };
  const identifiant = compte.siret ?? compte.siren;
  const annuaire = identifiant ? await chercherIdentite(identifiant) : null;
  if (annuaire && annuaire !== INDISPONIBLE) {
    const noms = await libelles(sql, annuaire.categorie_juridique, annuaire.naf);
    return {
      siren: annuaire.siren,
      siret: annuaire.siret ?? compte.siret,
      denomination: annuaire.nom ?? compte.nom,
      enseigne: annuaire.enseigne,
      adresse: annuaire.adresse,
      adresse_siege: annuaire.adresse_siege,
      forme_juridique: noms.forme,
      pme: estPme(annuaire.categorie),
      naf: annuaire.naf,
      naf_libelle: noms.naf,
      effectif: libelleEffectif(annuaire.tranche_effectif),
      date_creation: annuaire.date_creation,
      chiffres_affaires: annuaire.chiffres_affaires,
      ...contact,
      origine: "annuaire",
    };
  }
  const [base] = compte.siren
    ? await sql<{ nom: string | null; categorie_juridique: string | null; naf: string | null;
        tranche_effectif: string | null; categorie: string | null; date_creation: string | null }[]>`
        select nom, categorie_juridique, naf, tranche_effectif, categorie, date_creation::text as date_creation
        from entreprises where siren = ${compte.siren}`
    : [];
  const noms = await libelles(sql, base?.categorie_juridique ?? null, base?.naf ?? null);
  return {
    siren: compte.siren,
    siret: compte.siret,
    denomination: base?.nom ?? compte.nom,
    enseigne: null,
    adresse: null,
    adresse_siege: null,
    forme_juridique: noms.forme,
    pme: estPme(base?.categorie ?? null),
    naf: base?.naf ?? null,
    naf_libelle: noms.naf,
    effectif: libelleEffectif(base?.tranche_effectif ?? null),
    date_creation: base?.date_creation ?? null,
    chiffres_affaires: [],
    ...contact,
    origine: base ? "base" : "aucune",
  };
}

/** Lit le choix des lots tel que le formulaire de la page l'envoie. */
export function lireLots(cas: string | null, numeros: string | null): Lots {
  const lots = numeros?.trim().slice(0, 300);
  if (cas === "certains" && lots) return { cas: "certains", lots };
  if (cas === "tous") return { cas: "tous" };
  return { cas: "sans_lots" };
}

/** « Avis n° 26-94446 publié au BOAMP le 02/10/2026 » : la référence suffit pour les rubriques A et B. */
export function referenceAvis(avis: AvisCandidature): string {
  const support = avis.source === "ted" ? "Journal officiel de l'Union européenne (TED)" : "BOAMP";
  return `Avis n° ${avis.numero} publié au ${support} le ${jour(avis.date_publication)}`;
}

export function nomDeFichier(formulaire: "dc1" | "dc2", avis: AvisCandidature): string {
  return `${formulaire.toUpperCase()}-${avis.uid.replace(/[^\w-]/g, "")}.docx`;
}

function identification(c: Candidat): Bloc[] {
  const nom = [c.enseigne, c.denomination].filter(Boolean);
  const adresses = [c.adresse, c.adresse_siege && `Siège social : ${c.adresse_siege}`].filter(Boolean).join("\n");
  return [
    { type: "champ", libelle: "Nom commercial et dénomination sociale de l'unité ou de l'établissement qui exécutera la prestation",
      valeur: nom.length ? [...new Set(nom)].join(" – ") : null },
    { type: "champ", libelle: "Adresses postale et du siège social (si elle est différente de l'adresse postale)", valeur: adresses || null },
    { type: "champ", libelle: "Adresse électronique", valeur: c.email },
    { type: "champ", libelle: "Numéros de téléphone et de télécopie", valeur: c.telephone },
    { type: "champ", libelle: "Numéro SIRET", valeur: c.siret },
  ];
}

function acheteurEtObjet(avis: AvisCandidature, lots: Lots, dc2: boolean): Bloc[] {
  return [
    { type: "rubrique", texte: "A - Identification de l'acheteur" },
    { type: "texte", texte: avis.acheteur_nom ?? "Acheteur indiqué dans l'avis ci-dessous" },
    ...(avis.acheteur_siret ? [{ type: "champ", libelle: "SIRET de l'acheteur", valeur: avis.acheteur_siret } as const] : []),
    { type: "champ", libelle: "Référence de l'avis", valeur: `${referenceAvis(avis)}\n${avis.url}` },
    { type: "rubrique", texte: "B - Objet de la consultation" },
    { type: "texte", texte: avis.objet },
    { type: "champ", libelle: "Référence de l'avis", valeur: referenceAvis(avis) },
    ...(dc2 && lots.cas === "certains" ? [{ type: "champ", libelle: "Lot(s) concerné(s) par cette candidature", valeur: lots.lots } as const] : []),
    ...(dc2 && lots.cas === "tous" ? [{ type: "texte", texte: "Candidature pour tous les lots." } as const] : []),
  ];
}

function entete(formulaire: string, titre: string, sousTitre: string): Bloc[] {
  return [
    { type: "texte", texte: `MARCHÉS PUBLICS — ${formulaire}`, gras: true },
    { type: "titre", texte: titre },
    { type: "texte", texte: sousTitre, gras: true },
    { type: "texte", note: true, texte:
      `Document pré-rempli par ${NOM} à partir de l'avis publié et de l'annuaire public des entreprises. `
      + "Les informations en bleu ont été remplies pour vous : vérifiez-les, complétez les pointillés et cochez vous-même "
      + "les déclarations sur l'honneur avant de déposer votre candidature. Formulaire non obligatoire ; "
      + `modèle officiel et notice : ${PAGE_OFFICIELLE}` },
  ];
}

/** DC1, lettre de candidature, candidature individuelle. */
export function composerDC1(avis: AvisCandidature, candidat: Candidat, lots: Lots): Bloc[] {
  return [
    ...entete("DC1", "LETTRE DE CANDIDATURE", "Désignation du mandataire par ses co-traitants"),
    ...acheteurEtObjet(avis, lots, false),

    { type: "rubrique", texte: "C - Objet de la candidature" },
    { type: "texte", texte: "La candidature est présentée :" },
    { type: "case", cochee: lots.cas === "sans_lots", texte: "pour le marché public (en cas de non allotissement) ;" },
    { type: "case", cochee: lots.cas === "tous", texte: "pour tous les lots de la procédure de passation du marché public ;" },
    { type: "case", cochee: lots.cas === "certains",
      texte: `pour le lot n° ou les lots n° ${lots.cas === "certains" ? lots.lots : "……………"} de la procédure de passation du marché public.` },

    { type: "rubrique", texte: "D - Présentation du candidat" },
    { type: "case", cochee: true, texte: "Le candidat se présente seul :" },
    ...identification(candidat),
    { type: "case", cochee: false, texte: "Le candidat est un groupement d'entreprises :  ☐ conjoint  OU  ☐ solidaire" },

    { type: "rubrique", texte: "E - Identification des membres du groupement et répartition des prestations" },
    { type: "texte", texte: "Sans objet : candidature individuelle." },

    { type: "rubrique", texte: "F - Engagements du candidat individuel ou de chaque membre du groupement" },
    { type: "sous-rubrique", texte: "F1 – Exclusions de la procédure" },
    { type: "texte", texte: "Le candidat individuel, ou chaque membre du groupement, déclare sur l'honneur :" },
    { type: "texte", texte: "a) dans l'hypothèse d'un marché public autre que de défense ou de sécurité, ne pas entrer dans l'un des cas "
      + "d'exclusion prévus aux articles L. 2141-1 à L. 2141-5 ou aux articles L. 2141-7 à L. 2141-10 du code de la commande publique ;" },
    { type: "texte", texte: "b) dans l'hypothèse d'un marché public de défense ou de sécurité, ne pas entrer dans l'un des cas d'exclusion "
      + "prévus aux articles L. 2341-1 à L. 2341-3 ou aux articles L. 2141-7 à L. 2141-10 du code de la commande publique." },
    { type: "case", cochee: false, texte: "Afin d'attester que le candidat n'est pas dans un de ces cas d'exclusion, cocher la case suivante." },
    { type: "texte", note: true, texte: "À cocher par vous : c'est une déclaration sur l'honneur. Si votre situation change pendant la procédure, "
      + "prévenez l'acheteur sans délai." },
    { type: "sous-rubrique", texte: "F2 – Documents de preuve disponibles en ligne" },
    { type: "champ", libelle: "Adresse internet", valeur: null },
    { type: "champ", libelle: "Renseignements nécessaires pour y accéder", valeur: null },
    { type: "sous-rubrique", texte: "F3 – Capacités" },
    { type: "texte", texte: "Le candidat produit, aux fins de vérification de l'aptitude à exercer l'activité professionnelle, de la capacité "
      + "économique et financière et des capacités techniques et professionnelles :" },
    { type: "case", cochee: true, texte: "le formulaire DC2." },
    { type: "case", cochee: false, texte: "les documents établissant ses capacités, tels que demandés dans les documents de la consultation." },

    { type: "rubrique", texte: "G - Désignation du mandataire (en cas de groupement)" },
    { type: "texte", texte: "Sans objet : candidature individuelle." },

    { type: "texte", note: true, texte: `Modèle DC1 de la Direction des affaires juridiques, mis à jour le ${VERSION_DC1}.` },
  ];
}

/** DC2, déclaration du candidat individuel. */
export function composerDC2(avis: AvisCandidature, candidat: Candidat, lots: Lots): Bloc[] {
  const exercices = candidat.chiffres_affaires.slice(0, 3);
  const travaux = avis.famille === "travaux";
  return [
    ...entete("DC2", "DÉCLARATION DU CANDIDAT INDIVIDUEL", "ou du membre du groupement"),
    ...acheteurEtObjet(avis, lots, true),

    { type: "rubrique", texte: "C - Identification du candidat individuel ou du membre du groupement" },
    { type: "sous-rubrique", texte: "C1 - Cas général" },
    ...identification(candidat),
    { type: "champ", libelle: "Forme juridique du candidat (entreprise individuelle, SA, SARL, EURL, association, établissement public, etc.)",
      valeur: candidat.forme_juridique },
    { type: "texte", texte: "Le candidat est-il une micro, une petite ou une moyenne entreprise au sens de la recommandation de la Commission "
      + "du 6 mai 2003 ou un artisan au sens de l'article 19 de la loi n° 96-603 du 5 juillet 1996 (art. R. 2151-13 et R. 2351-12 du code "
      + "de la commande publique) ?" },
    { type: "case", cochee: candidat.pme === true, texte: "Oui" },
    { type: "case", cochee: candidat.pme === false, texte: "Non" },
    ...(candidat.pme !== null ? [{ type: "texte", note: true, texte: "Réponse déduite de la catégorie d'entreprise publiée par l'Insee." } as const] : []),

    { type: "sous-rubrique", texte: "C2 - Cas particuliers en cas de marché public réservé" },
    { type: "texte", note: true, texte: "À remplir seulement si le marché est réservé et que votre structure a l'un de ces statuts." },
    { type: "case", cochee: false, texte: "Entreprise adaptée (article L. 5213-13 du code du travail) ou structure équivalente" },
    { type: "case", cochee: false, texte: "Établissement et service d'aide par le travail (articles L. 344-2 et suivants du code de l'action sociale et des familles) ou structure équivalente" },
    { type: "case", cochee: false, texte: "Structure d'insertion par l'activité économique (article L. 5132-4 du code du travail) ou structure équivalente" },
    { type: "case", cochee: false, texte: "Entreprise de l'économie sociale et solidaire (article 1er de la loi n° 2014-856 du 31 juillet 2014) ou structure équivalente" },

    { type: "sous-rubrique", texte: "C3 - Cas spécifiques relatifs aux conditions de participation" },
    { type: "champ", libelle: "1. Inscription sur une liste officielle d'opérateurs économiques agréés : nom de la liste", valeur: null },
    { type: "case", cochee: false, texte: "2. Lorsque l'acheteur l'a autorisé (article R. 2143-4 du code de la commande publique) : le candidat déclare sur "
      + "l'honneur satisfaire à l'ensemble des conditions de participation requises par l'acheteur. (Dans ce cas, les rubriques suivantes sont inutiles.)" },

    { type: "rubrique", texte: "E - Renseignements relatifs à l'aptitude à exercer l'activité professionnelle" },
    { type: "texte", note: true, texte: "Le candidat ne fournit que les renseignements demandés par l'acheteur." },
    { type: "sous-rubrique", texte: "E1 - Renseignements sur l'inscription sur un registre professionnel" },
    { type: "champ", libelle: "Numéro SIREN", valeur: candidat.siren },
    { type: "champ", libelle: "Code APE (NAF)", valeur: candidat.naf && [candidat.naf, candidat.naf_libelle].filter(Boolean).join(" – ") },
    { type: "champ", libelle: "Registre (RCS ou répertoire des métiers) et ville d'immatriculation", valeur: null },
    { type: "sous-rubrique", texte: "E2 - Autorisation spécifique ou organisation dont le candidat doit être membre (marchés de services)" },
    { type: "champ", libelle: "Le cas échéant", valeur: null },
    { type: "sous-rubrique", texte: "E3 - Documents de preuve disponibles en ligne" },
    { type: "champ", libelle: "Adresse(s) internet", valeur: null },

    { type: "rubrique", texte: "F - Renseignements relatifs à la capacité économique et financière" },
    { type: "texte", note: true, texte: "Le candidat ne fournit que les renseignements demandés par l'acheteur." },
    { type: "sous-rubrique", texte: "F1 - Chiffres d'affaires hors taxes des trois derniers exercices disponibles" },
    { type: "tableau", libelles: true, lignes: [
      ["", ...(exercices.length ? exercices.map((e) => `Exercice clos en ${e.annee}`) : ["Exercice du … au …", "Exercice du … au …", "Exercice du … au …"])],
      ["Chiffre d'affaires global", ...(exercices.length ? exercices.map((e) => eurosExacts.format(e.ca)) : [null, null, null])],
      ["Part du chiffre d'affaires concernant l'objet du marché (si demandé)", ...(exercices.length ? exercices : [0, 0, 0]).map(() => "… %")],
    ] },
    ...(exercices.length
      ? [{ type: "texte", note: true, texte: "Chiffres d'affaires tirés des comptes publiés (annuaire des entreprises). Vérifiez-les avec vos derniers bilans." } as const]
      : [{ type: "texte", note: true, texte: "Vos comptes ne sont pas publiés : indiquez les chiffres de vos trois derniers bilans." } as const]),
    { type: "champ", libelle: "Date de création ou de début d'activité (si les chiffres ne couvrent pas toute la période)",
      valeur: candidat.date_creation ? jour(candidat.date_creation) : null },
    { type: "sous-rubrique", texte: "F2 - Autres informations requises par l'acheteur au titre de la capacité économique et financière" },
    { type: "champ", libelle: "Assurance responsabilité civile professionnelle, etc.", valeur: null },
    { type: "sous-rubrique", texte: "F3 - Pour les marchés publics de travaux" },
    { type: "case", cochee: false, texte: "En cochant cette case, le candidat déclare qu'il aura souscrit un contrat d'assurance le couvrant au regard de la "
      + "responsabilité décennale (article L. 241-1 du code des assurances)." },
    ...(travaux ? [{ type: "texte", note: true, texte: "Ce marché est un marché de travaux : cochez si vous avez cette assurance." } as const] : []),
    { type: "sous-rubrique", texte: "F4 - Documents de preuve disponibles en ligne" },
    { type: "champ", libelle: "Adresse internet", valeur: null },

    { type: "rubrique", texte: "G - Renseignements relatifs à la capacité technique et professionnelle" },
    { type: "sous-rubrique", texte: "G1 - Renseignements demandés par l'acheteur, que le candidat peut récapituler ici" },
    { type: "champ", libelle: "Effectif salarié", valeur: candidat.effectif },
    { type: "champ", libelle: "Références de marchés similaires (acheteur, objet, montant, année)", valeur: null },
    { type: "champ", libelle: "Moyens techniques, certifications, qualifications", valeur: null },
    { type: "sous-rubrique", texte: "G2 - Documents de preuve disponibles en ligne" },
    { type: "champ", libelle: "Adresse internet", valeur: null },

    { type: "rubrique", texte: "H - Capacités des opérateurs économiques sur lesquels le candidat s'appuie" },
    { type: "texte", note: true, texte: "À remplir seulement si vous vous appuyez sur les capacités d'une autre entreprise (sous-traitant, société du groupe…)." },
    { type: "tableau", lignes: [
      ["N° du lot", "Nom commercial, dénomination sociale, adresse, courriel, téléphone et SIRET de l'opérateur"],
      [null, null],
    ] },

    { type: "rubrique", texte: "I - Renseignements spécifiques aux marchés publics de défense ou de sécurité" },
    { type: "texte", note: true, texte: "À remplir seulement pour un marché de défense ou de sécurité." },
    { type: "champ", libelle: "I1 - Nationalité du candidat", valeur: null },

    { type: "texte", note: true, texte: `Modèle DC2 de la Direction des affaires juridiques, mis à jour le ${VERSION_DC2}.` },
  ];
}
