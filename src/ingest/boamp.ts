/**
 * Avis nationaux du BOAMP (API Opendatasoft de la DILA, sans clé).
 * Trois formats coexistent dans le champ `donnees` : « FNSimple » (procédures formalisées), « MAPA »
 * (procédures adaptées) et quelques « DSP » ou « DIVERS ». Les champs d'indexation (objet, acheteur,
 * départements, date limite…) sont communs ; le reste est lu dans `donnees` quand il existe.
 */
import {
  type Avis, dedoublonnerTitulaires, familleDuCpv, type Famille, identifiantEntreprise, siret,
  type Titulaire, type TypeAvis,
} from "./avis";
import { fetchAvecReprises } from "./telechargement";
import { normaliserDepartement } from "./departements";

const EXPORT = "https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/exports/json";

const CHAMPS = [
  "idweb", "objet", "nomacheteur", "titulaire", "code_departement", "dateparution", "datelimitereponse",
  "nature", "famille", "type_marche", "descripteur_libelle", "url_avis", "annonce_lie", "donnees",
];

export type EnregistrementBoamp = {
  idweb: string;
  objet: string | null;
  nomacheteur: string | null;
  titulaire: string[] | null;
  code_departement: string[] | null;
  dateparution: string;
  datelimitereponse: string | null;
  nature: string | null;
  famille: string | null;
  type_marche: string[] | null;
  descripteur_libelle: string[] | null;
  url_avis: string | null;
  annonce_lie: string[] | null;
  donnees: string | null;
};

/** Avis publiés entre deux dates incluses (AAAA-MM-JJ), hors avis européens. */
export function urlExportBoamp(depuis: string, jusqua: string): string {
  const params = new URLSearchParams({
    select: CHAMPS.join(","),
    where: `dateparution >= date'${depuis}' and dateparution <= date'${jusqua}' and famille != 'JOUE'`,
  });
  return `${EXPORT}?${params}`;
}

export async function telechargerBoamp(depuis: string, jusqua: string): Promise<EnregistrementBoamp[]> {
  const reponse = await fetchAvecReprises(urlExportBoamp(depuis, jusqua));
  if (!reponse.ok) throw new Error(`BOAMP : erreur ${reponse.status}`);
  return (await reponse.json()) as EnregistrementBoamp[];
}

const TYPES: Record<string, TypeAvis> = {
  APPEL_OFFRE: "marche",
  ATTRIBUTION: "attribution",
  EX_ANTE_VOLONTAIRE: "attribution",
  RECTIFICATIF: "rectificatif",
  ANNULATION: "annulation",
  "PRE-INFORMATION": "preinformation",
  PRE_INFORMATION: "preinformation",
  MODIFICATION: "modification",
};

const FAMILLES: Record<string, Famille> = { TRAVAUX: "travaux", FOURNITURES: "fournitures", SERVICES: "services" };

/** Convertit un enregistrement du BOAMP ; null pour un avis européen (pris sur TED). */
export function lireAvisBoamp(e: EnregistrementBoamp): Avis | null {
  if (e.famille === "JOUE") return null;
  const donnees: unknown = e.donnees ? JSON.parse(e.donnees) : {};
  const cpv = premier(valeurs(donnees, "classPrincipale"))?.replace(/\D/g, "").slice(0, 8) || null;
  const texteAttribution = premier(valeurs(donnees, "attributionMarche"));
  const libre = texteAttribution ? analyserTexteAttribution(texteAttribution) : null;

  const titulaires: Titulaire[] = [
    ...(e.titulaire ?? []).map((nom) => ({ nom: nom.trim(), identifiant: null })),
    ...valeurs(donnees, "PersonneMorale").map((nom) => ({ nom: nom.trim(), identifiant: null })),
    ...(libre?.titulaires ?? []),
  ];

  return {
    uid: `boamp-${e.idweb}`,
    source: "boamp",
    numero: e.idweb,
    type: TYPES[e.nature ?? ""] ?? "autre",
    objet: (e.objet ?? premier(valeurs(donnees, "intitule")) ?? "Objet non publié").trim(),
    acheteur_nom: e.nomacheteur?.trim() || null,
    acheteur_siret: siret(premier(valeurs(donnees, "codeIdentificationNational"))),
    cpv,
    famille: familleDuCpv(cpv) ?? FAMILLES[e.type_marche?.[0] ?? ""] ?? null,
    descripteurs: e.descripteur_libelle?.length ? e.descripteur_libelle : null,
    departements: [...new Set((e.code_departement ?? []).map(normaliserDepartement).filter((d) => d !== null))],
    date_publication: e.dateparution.slice(0, 10),
    date_limite: e.datelimitereponse ? dateParis(e.datelimitereponse) : null,
    montant: libre?.montant ?? nombre(premier(montantsMapa(donnees))),
    offres_recues: libre?.offres ?? entier(premier(valeurs(donnees, "nbOffresRecues"))),
    url: e.url_avis ?? `https://www.boamp.fr/pages/avis/?q=idweb:${e.idweb}`,
    avis_initial: e.annonce_lie?.[0] ?? premier(valeurs(donnees, "idWeb")) ?? null,
    titulaires: dedoublonnerTitulaires(titulaires),
  };
}

/**
 * Lit le texte libre des attributions « FNSimple » : nombre d'offres, montant, titulaires et SIRET quand
 * il est donné. Chaque acheteur rédige à sa façon ; on cherche les titulaires dans cet ordre :
 * un libellé (« Titulaire : X », « Attributaire X - adresse »), une ligne « Nom, adresse, code postal
 * ville », puis une phrase (« attribué à l'entreprise X »).
 */
export function analyserTexteAttribution(texte: string): {
  offres: number | null; montant: number | null; titulaires: Titulaire[];
} {
  const offres = entier(/nombre d'offres re[çc]ues\s*:\s*(\d+)/i.exec(texte)?.[1]);
  const montant = nombre(/(?:montant|prix)[^\d\n]*?(\d[\d \u00a0\u202f.]*(?:,\d{1,2})?)/i.exec(texte)?.[1]);
  // « SIREN : » suivi de 14 chiffres arrive aussi : on accepte les deux libellés et les deux longueurs
  const sirets = [...texte.matchAll(/sire[tn]\s*:?\s*(\d(?:[\s.]?\d){13}|\d(?:[\s.]?\d){8})(?!\d)/gi)]
    .map((m) => identifiantEntreprise(m[1]))
    .filter((s) => s !== null);

  // « NOM DE L'ENTREPRISE (12345678900012) » : nom et SIRET ensemble, le cas le plus sûr
  const avecSiret = [...texte.matchAll(/([^\n:()–-]{2,80}?)\s*\((\d{14})\b/g)];
  if (avecSiret.length > 0) {
    return {
      offres, montant,
      titulaires: avecSiret.map((m) => ({
        // « Le marché a été attribué à la société X (…) » : on ne garde que X
        nom: couperNom(m[1].replace(/^.*\b(?:soci[ée]t[ée]|entreprise|attribu[ée]e?s? à)\s*:?\s+/i, "")) || null,
        identifiant: identifiantEntreprise(m[2]),
      })),
    };
  }

  let noms = [...texte.matchAll(
    /(?:^|\s-\s)[ \t]*(?:nom du titulaire|titulaire(?: retenu)?|attributaires?)[ \t]*:?[ \t]+([^\n]+)/gim,
  )].map((m) => couperNom(m[1]));

  if (noms.length === 0) {
    for (const brute of texte.split("\n")) {
      let ligne = brute.trim();
      const lot = /^lot\s*[\w°.-]*\s*[:\-–]\s*(.+)$/i.exec(ligne);
      if (lot) ligne = lot[1];
      if (ligne.includes(":") || !/\b\d{5}\b/.test(ligne) || /^\d/.test(ligne)) continue;
      if (/^(montant|date|nombre|march[ée]|sous-traitance|renseignements|t[ée]l|dur[ée]e)/i.test(ligne)) continue;
      if (/attribu|notifi|sire[tn]/i.test(ligne)) continue; // une phrase : traitée plus bas
      noms.push(couperNom(ligne));
    }
  }

  if (noms.length === 0) {
    const phrase = /(?:attribu[ée]e?s?|notifi[ée]e?s?)(?: le [\d/]+)? (?:à|au|aux) (?:l'entreprise|la société|la sociét[ée]|l'opérateur|la |le |l')?[ \t]*:?\s*(.+?)(?=\s+-\s|\s+pour\s|\s+qui\s|\s+\(|,|\.\s|\.$|\n|$)/i
      .exec(texte)?.[1];
    if (phrase && !/^(un|une|des|le|la|les)\s/i.test(phrase.trim())) noms.push(couperNom(phrase));
  }
  // écarte les phrases prises pour un nom (« Les montants indiqués sont… », « du marché »)
  noms = noms.filter((nom) =>
    nom.length >= 2 && nom.length <= 90 && nom.split(/\s+/).length <= 10 &&
    !/^(du|de la|des|dans|pour|sur|\d+ entreprise)\b/i.test(nom));

  const titulaires: Titulaire[] =
    noms.length === sirets.length
      ? noms.map((nom, i) => ({ nom, identifiant: sirets[i] }))
      : [
          ...noms.map((nom) => ({ nom, identifiant: null })),
          ...sirets.map((identifiant) => ({ nom: null, identifiant })),
        ];
  return { offres, montant, titulaires };
}

/** Nom d'entreprise en tête d'un texte « Nom - adresse » ou « Nom, adresse ». */
function couperNom(texte: string): string {
  return texte.split(/\s+-\s|,|\s:\s|\s\(|\s+situ[ée]e?s?\s|\s+pour\s/)[0].replace(/[\s.;]+$/, "").trim();
}

/** Montants attribués des avis MAPA (`montant.valeur`). */
function montantsMapa(donnees: unknown): string[] {
  const montants: string[] = [];
  parcourir(donnees, (cle, valeur) => {
    if (cle === "montant" && valeur && typeof valeur === "object" && "valeur" in valeur) {
      montants.push(String((valeur as { valeur: unknown }).valeur));
    }
  });
  return montants;
}

/** Toutes les valeurs simples rangées sous une clé donnée, à n'importe quelle profondeur. */
export function valeurs(donnees: unknown, cle: string): string[] {
  const trouvees: string[] = [];
  parcourir(donnees, (c, valeur) => {
    if (c !== cle) return;
    for (const v of Array.isArray(valeur) ? valeur : [valeur]) {
      if ((typeof v === "string" && v.trim() !== "") || typeof v === "number") trouvees.push(String(v));
    }
  });
  return trouvees;
}

function parcourir(noeud: unknown, visiter: (cle: string, valeur: unknown) => void) {
  if (Array.isArray(noeud)) {
    for (const element of noeud) parcourir(element, visiter);
  } else if (noeud && typeof noeud === "object") {
    for (const [cle, valeur] of Object.entries(noeud)) {
      visiter(cle, valeur);
      parcourir(valeur, visiter);
    }
  }
}

function premier<T>(liste: T[]): T | undefined {
  return liste[0];
}

/** Nombre écrit à la française (« 935 220,00 », « 1.200 ») ou avec un point décimal (« 284 782.86 »). */
function nombre(texte: string | undefined): number | null {
  if (!texte) return null;
  const brut = texte.trim().replace(/[\s\u00a0\u202f]/g, "");
  const n = brut.includes(",")
    ? Number(brut.replaceAll(".", "").replace(",", "."))
    : /\.\d{1,2}$/.test(brut) ? Number(brut) : Number(brut.replaceAll(".", ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function entier(texte: string | undefined): number | null {
  const n = Number.parseInt(texte ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Date (AAAA-MM-JJ) à Paris d'un horodatage ISO. */
export function dateParis(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(date);
}
