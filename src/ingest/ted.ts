/**
 * Avis européens des acheteurs français (API de recherche TED v3, sans clé).
 * Un avis de modification (« change notice ») porte un nouvel identifiant : on le classe en rectificatif
 * pour ne pas l'annoncer comme un nouveau marché.
 */
import { type Avis, dedoublonnerTitulaires, familleDuCpv, type Famille, identifiantEntreprise, siret, type Titulaire, type TypeAvis } from "./avis";
import { departementDuCodePostal, departementsDuNuts } from "./departements";
import { fetchAvecReprises } from "./telechargement";

const RECHERCHE = "https://api.ted.europa.eu/v3/notices/search";

const CHAMPS = [
  "publication-number", "notice-type", "publication-date", "title-proc", "buyer-name", "buyer-identifier",
  "buyer-post-code", "main-classification-proc", "contract-nature-main-proc", "place-of-performance-subdiv-proc",
  "deadline-receipt-tender-date-lot", "winner-name", "winner-identifier", "BT-759-LotResult", "total-value",
  "estimated-value-proc", "change-notice-version-identifier",
];

/** Texte multilingue : `{ fra: "…" }` ou `{ fra: ["…"] }`. */
type Multilingue = Record<string, string | string[]>;

export type AvisTed = {
  "publication-number": string;
  "notice-type": string;
  "publication-date": string;
  "title-proc"?: Multilingue;
  "buyer-name"?: Multilingue;
  "buyer-identifier"?: string[];
  "buyer-post-code"?: string[];
  "main-classification-proc"?: string[];
  "contract-nature-main-proc"?: string;
  "place-of-performance-subdiv-proc"?: string[];
  "deadline-receipt-tender-date-lot"?: string[];
  "winner-name"?: Multilingue;
  "winner-identifier"?: string[];
  "BT-759-LotResult"?: string[];
  "total-value"?: number;
  "estimated-value-proc"?: string;
  "change-notice-version-identifier"?: string;
};

/** Avis publiés entre deux dates incluses (AAAA-MM-JJ). */
export async function telechargerTed(depuis: string, jusqua: string): Promise<AvisTed[]> {
  const requete = `buyer-country=FRA AND publication-date>=${depuis.replaceAll("-", "")} ` +
    `AND publication-date<=${jusqua.replaceAll("-", "")}`;
  const avis: AvisTed[] = [];
  let jeton: string | undefined;
  do {
    const reponse = await fetchAvecReprises(RECHERCHE, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: requete, fields: CHAMPS, limit: 250, paginationMode: "ITERATION",
        ...(jeton ? { iterationNextToken: jeton } : { page: 1 }),
      }),
    });
    if (!reponse.ok) throw new Error(`TED : erreur ${reponse.status} ${await reponse.text()}`);
    const page = (await reponse.json()) as { notices: AvisTed[]; iterationNextToken?: string | null };
    avis.push(...page.notices);
    jeton = page.notices.length > 0 ? page.iterationNextToken ?? undefined : undefined;
  } while (jeton);
  return avis;
}

const FAMILLES: Record<string, Famille> = { works: "travaux", supplies: "fournitures", services: "services" };

function typeAvis(n: AvisTed): TypeAvis {
  if (n["change-notice-version-identifier"]) return "rectificatif";
  const type = n["notice-type"];
  if (type === "can-modif") return "modification";
  if (type.startsWith("can") || type === "veat") return "attribution";
  if (type.startsWith("cn") || type === "qu-sy" || type === "subco") return "marche";
  if (type.startsWith("pin")) return "preinformation";
  return "autre";
}

/** Texte en français s'il existe, sinon dans la première langue disponible. */
function textes(valeur: Multilingue | undefined): string[] {
  if (!valeur) return [];
  const brut = valeur.fra ?? valeur.FRA ?? Object.values(valeur)[0];
  return (Array.isArray(brut) ? brut : [brut]).map((t) => t.trim()).filter(Boolean);
}

export function lireAvisTed(n: AvisTed): Avis {
  const numero = n["publication-number"];
  const cpv = n["main-classification-proc"]?.[0]?.slice(0, 8) ?? null;
  const nuts = (n["place-of-performance-subdiv-proc"] ?? []).flatMap(departementsDuNuts);
  const departements = nuts.length > 0
    ? nuts
    : (n["buyer-post-code"] ?? []).map(departementDuCodePostal).filter((d) => d !== null);

  // Noms et identifiants des titulaires sont donnés dans le même ordre ; s'ils ne correspondent pas,
  // on ne garde que les noms.
  const noms = textes(n["winner-name"]);
  const identifiants = n["winner-identifier"] ?? [];
  const titulaires: Titulaire[] = noms.map((nom, i) => ({
    nom,
    identifiant: identifiants.length === noms.length ? identifiantEntreprise(identifiants[i]) : null,
  }));

  const offres = [...new Set(n["BT-759-LotResult"] ?? [])];
  const type = typeAvis(n);
  const estime = Number(n["estimated-value-proc"]);
  const montant = type === "attribution" ? n["total-value"] : Number.isFinite(estime) && estime > 0 ? estime : n["total-value"];
  const delais = (n["deadline-receipt-tender-date-lot"] ?? []).map((d) => d.slice(0, 10)).sort();

  return {
    uid: `ted-${numero}`,
    source: "ted",
    numero,
    type,
    objet: textes(n["title-proc"])[0] ?? "Objet non publié",
    acheteur_nom: textes(n["buyer-name"])[0] ?? null,
    acheteur_siret: (n["buyer-identifier"] ?? []).map(siret).find((s) => s !== null) ?? null,
    cpv,
    famille: familleDuCpv(cpv) ?? FAMILLES[n["contract-nature-main-proc"] ?? ""] ?? null,
    descripteurs: null,
    departements: [...new Set(departements)],
    date_publication: n["publication-date"].slice(0, 10),
    date_limite: delais[0] ?? null,
    montant: montant && montant > 0 ? montant : null,
    // un seul chiffre quand tous les lots ont reçu le même nombre d'offres
    offres_recues: offres.length === 1 && Number(offres[0]) > 0 ? Number(offres[0]) : null,
    url: `https://ted.europa.eu/fr/notice/-/detail/${numero}`,
    avis_initial: null,
    titulaires: dedoublonnerTitulaires(titulaires),
  };
}
