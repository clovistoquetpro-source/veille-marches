import type postgres from "postgres";
import type { AvisCandidature, Candidat } from "./candidature";
import { demanderJson, supprimerFichier, type BlocContenu } from "./claude";
import { jour } from "./format";
import { ANALYSES_PAR_MOIS } from "./produit";
import { tableauPg } from "./pg";
import type { Profil } from "./profil";

/**
 * Analyse « on y va ou pas » d'un dossier de consultation : le client dépose les PDF (règlement de
 * la consultation, CCAP, CCTP…), l'IA les lit avec ce que l'on sait de son entreprise et rend un
 * avis structuré. Chaque analyse coûte quelques dizaines de centimes : d'où un quota mensuel.
 */

export const MODELE_ANALYSE = "claude-sonnet-5-5";
/** Au-delà, l'API refuse le document ou l'analyse coûte trop cher. */
export const TAILLE_MAX_FICHIER = 30 * 1024 * 1024;
export const FICHIERS_MAX = 5;
/** Garde-fou contre les dépôts en boucle : fichiers déposés par compte sur 24 heures. */
export const DEPOTS_MAX_PAR_JOUR = 40;

export type Exigence = { exigence: string; eliminatoire: boolean; statut: "rempli" | "a_verifier" | "manquant" };

export type ResultatAnalyse = {
  verdict: "y_aller" | "a_etudier" | "passer";
  resume: string;
  raisons_pour: string[];
  raisons_contre: string[];
  exigences: Exigence[];
  pieces_a_fournir: string[];
  criteres: { critere: string; poids: string }[];
  dates: { quoi: string; quand: string }[];
  montant_duree: string;
  questions_acheteur: string[];
};

const liste = (description: string) => ({ type: "array", items: { type: "string" }, description });

export const SCHEMA_ANALYSE = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "resume", "raisons_pour", "raisons_contre", "exigences", "pieces_a_fournir",
    "criteres", "dates", "montant_duree", "questions_acheteur"],
  properties: {
    verdict: {
      type: "string",
      enum: ["y_aller", "a_etudier", "passer"],
      description: "y_aller : l'entreprise a ses chances et rien ne l'élimine ; a_etudier : faisable sous réserve de points à vérifier ; passer : une condition éliminatoire n'est pas remplie ou le marché ne correspond pas.",
    },
    resume: { type: "string", description: "Deux ou trois phrases : ce que l'acheteur veut, et pourquoi ce verdict." },
    raisons_pour: liste("Atouts de l'entreprise pour ce marché (3 à 5)."),
    raisons_contre: liste("Risques, contraintes ou points faibles (3 à 5)."),
    exigences: {
      type: "array",
      description: "Conditions de participation et exigences fortes : chiffre d'affaires minimum, références, certifications, qualifications, assurances, visite obligatoire, moyens humains…",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["exigence", "eliminatoire", "statut"],
        properties: {
          exigence: { type: "string", description: "L'exigence, avec sa référence dans le dossier, par exemple « (RC, art. 6.2) »." },
          eliminatoire: { type: "boolean", description: "Vrai si son absence écarte la candidature." },
          statut: {
            type: "string",
            enum: ["rempli", "a_verifier", "manquant"],
            description: "D'après ce que l'on sait de l'entreprise : rempli, à vérifier (on ne sait pas), ou manquant.",
          },
        },
      },
    },
    pieces_a_fournir: liste("Pièces de la candidature et de l'offre à remettre (DC1, DC2, mémoire technique, BPU…)."),
    criteres: {
      type: "array",
      description: "Critères de jugement des offres et leur pondération.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["critere", "poids"],
        properties: {
          critere: { type: "string" },
          poids: { type: "string", description: "« 60 % », « 40 points », ou « non précisé »." },
        },
      },
    },
    dates: {
      type: "array",
      description: "Dates à ne pas manquer : remise des offres, visite, questions, démarrage.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["quoi", "quand"],
        properties: { quoi: { type: "string" }, quand: { type: "string", description: "Date et heure telles qu'écrites dans le dossier." } },
      },
    },
    montant_duree: { type: "string", description: "Forme du marché, durée, reconductions et montant estimé ou maximum, ou « non précisé »." },
    questions_acheteur: liste("Questions utiles à poser à l'acheteur avant la date limite (0 à 4)."),
  },
} as const;

/** Début du mois en cours, heure de Paris : le quota repart à zéro le 1er à minuit. */
const DEBUT_DU_MOIS = "date_trunc('month', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris'";

export async function analysesRestantes(sql: postgres.Sql, compteId: string): Promise<number> {
  const [{ faites }] = await sql<{ faites: number }[]>`
    select count(*)::int as faites from analyses
    where compte_id = ${compteId} and cree_le >= ${sql.unsafe(DEBUT_DU_MOIS)}`;
  return Math.max(0, ANALYSES_PAR_MOIS - faites);
}

export async function depotsRecents(sql: postgres.Sql, compteId: string): Promise<number> {
  const [{ depots }] = await sql<{ depots: number }[]>`
    select count(*)::int as depots from analyses_fichiers
    where compte_id = ${compteId} and depose_le > now() - interval '24 hours'`;
  return depots;
}

export async function enregistrerFichier(
  sql: postgres.Sql, compteId: string, fichier: { id: string; nom: string; taille: number },
): Promise<void> {
  await sql`
    insert into analyses_fichiers (fichier_id, compte_id, nom, taille)
    values (${fichier.id}, ${compteId}, ${fichier.nom}, ${fichier.taille})
    on conflict (fichier_id) do nothing`;
}

/** Les fichiers demandés qui appartiennent bien à ce compte, dans l'ordre demandé. */
export async function fichiersDuCompte(
  sql: postgres.Sql, compteId: string, ids: string[],
): Promise<{ fichier_id: string; nom: string }[]> {
  if (ids.length === 0) return [];
  const lignes = await sql<{ fichier_id: string; nom: string }[]>`
    select fichier_id, nom from analyses_fichiers
    where compte_id = ${compteId} and fichier_id = any(${tableauPg(ids)}::text[])`;
  return ids.map((id) => lignes.find((l) => l.fichier_id === id)).filter((l) => l !== undefined);
}

/** Efface les fichiers chez Anthropic et chez nous : le dossier ne sert plus une fois analysé. */
export async function oublierFichiers(sql: postgres.Sql, cle: string, ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => supprimerFichier(cle, id)));
  if (ids.length) await sql`delete from analyses_fichiers where fichier_id = any(${tableauPg(ids)}::text[])`;
}

/** Efface les fichiers déposés puis jamais analysés (page fermée en cours de route), quelques-uns à la fois. */
export async function oublierFichiersAbandonnes(sql: postgres.Sql, cle: string): Promise<void> {
  const vieux = await sql<{ fichier_id: string }[]>`
    select fichier_id from analyses_fichiers where depose_le < now() - interval '2 hours' limit 10`;
  await oublierFichiers(sql, cle, vieux.map((f) => f.fichier_id));
}

export function consigneAnalyse(avis: AvisCandidature, candidat: Candidat, profil: Profil | null): string {
  const ca = candidat.chiffres_affaires.slice(0, 3).map((e) => `${e.annee} : ${Math.round(e.ca).toLocaleString("fr-FR")} €`).join(" ; ");
  return [
    "Tu conseilles une entreprise française qui hésite à répondre à un marché public. Lis le dossier de",
    "consultation joint (règlement de la consultation, cahiers des charges…) et dis-lui si elle doit y aller.",
    "",
    "L'avis :",
    `- Objet : ${avis.objet}`,
    `- Acheteur : ${avis.acheteur_nom ?? "non indiqué"}`,
    `- Publié le ${jour(avis.date_publication)}${avis.date_limite ? `, réponse avant le ${jour(avis.date_limite)}` : ""}`,
    "",
    "L'entreprise (données publiques, possiblement incomplètes) :",
    `- Nom : ${[candidat.enseigne, candidat.denomination].filter(Boolean).join(" – ") || "inconnu"}`,
    `- Activité : ${[candidat.naf, candidat.naf_libelle].filter(Boolean).join(" ") || "inconnue"}`,
    `- Forme juridique : ${candidat.forme_juridique ?? "inconnue"} ; PME : ${candidat.pme === null ? "inconnu" : candidat.pme ? "oui" : "non"}`,
    `- Effectif : ${candidat.effectif ?? "inconnu"}`,
    `- Chiffre d'affaires : ${ca || "non publié"}`,
    `- Création : ${candidat.date_creation ? jour(candidat.date_creation) : "inconnue"}`,
    `- Adresse : ${candidat.adresse ?? "inconnue"}`,
    profil && (profil.mots_cles.length || profil.cpv.length)
      ? `- Ce qu'elle surveille : ${[...profil.mots_cles, ...profil.cpv.map((c) => `CPV ${c}`)].join(", ")}`
      : null,
    "",
    "Règles :",
    "- Appuie-toi uniquement sur le dossier. Cite l'article ou la page entre parenthèses quand tu le peux.",
    "- Si une information manque, écris « non précisé » ; n'invente rien.",
    "- Une exigence que les données ci-dessus ne permettent pas de confirmer est « a_verifier », pas « manquant ».",
    "- « passer » seulement si une condition éliminatoire n'est clairement pas remplie, si le marché ne",
    "  correspond pas du tout à l'activité, ou si la date limite est trop proche pour répondre sérieusement.",
    "- Écris en français simple, pour un dirigeant de PME pressé : des phrases courtes, pas de jargon inutile.",
  ].filter((ligne) => ligne !== null).join("\n");
}

/** Lance l'analyse ; renvoie null si l'IA n'a pas pu répondre. */
export async function analyserDossier({ cle, avis, candidat, profil, fichiers, modele = process.env.MODELE_ANALYSE ?? MODELE_ANALYSE }: {
  cle: string;
  avis: AvisCandidature;
  candidat: Candidat;
  profil: Profil | null;
  fichiers: { fichier_id: string; nom: string }[];
  modele?: string;
}) {
  const contenu: BlocContenu[] = [
    ...fichiers.map((f) => ({ type: "document" as const, source: { type: "file" as const, file_id: f.fichier_id }, title: f.nom })),
    { type: "text", text: consigneAnalyse(avis, candidat, profil) },
  ];
  const reponse = await demanderJson<ResultatAnalyse>({
    cle, modele, contenu, schema: SCHEMA_ANALYSE, maxTokens: 16_000, effort: "medium", delai: 300_000,
  });
  return reponse && { ...reponse, modele };
}

export async function enregistrerAnalyse(sql: postgres.Sql, analyse: {
  compteId: string; avisUid: string; fichiers: string[]; resultat: ResultatAnalyse;
  modele: string; consommation: { entree: number; sortie: number };
}): Promise<string> {
  const [{ id }] = await sql<{ id: string }[]>`
    insert into analyses (compte_id, avis_uid, fichiers, resultat, modele, jetons_entree, jetons_sortie)
    values (${analyse.compteId}, ${analyse.avisUid}, ${tableauPg(analyse.fichiers)}::text[], ${sql.json(analyse.resultat as never)},
      ${analyse.modele}, ${analyse.consommation.entree}, ${analyse.consommation.sortie})
    returning id`;
  return id;
}

export type AnalyseEnregistree = {
  id: string; avis_uid: string; fichiers: string[]; resultat: ResultatAnalyse; cree_le: string;
};

export async function analyseDuCompte(sql: postgres.Sql, compteId: string, id: string): Promise<AnalyseEnregistree | null> {
  // un identifiant mal formé ne doit pas faire échouer la requête
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [ligne] = await sql<AnalyseEnregistree[]>`
    select id, avis_uid, array_to_json(fichiers) as fichiers, resultat::json as resultat, cree_le::text as cree_le
    from analyses where id = ${id} and compte_id = ${compteId}`;
  return ligne ?? null;
}

export async function analysesDeLAvis(sql: postgres.Sql, compteId: string, avisUid: string): Promise<AnalyseEnregistree[]> {
  return sql<AnalyseEnregistree[]>`
    select id, avis_uid, array_to_json(fichiers) as fichiers, resultat::json as resultat, cree_le::text as cree_le
    from analyses where compte_id = ${compteId} and avis_uid = ${avisUid}
    order by cree_le desc limit 10`;
}

export const VERDICTS: Record<ResultatAnalyse["verdict"], { titre: string; couleur: string }> = {
  y_aller: { titre: "On y va", couleur: "border-emerald-300 bg-emerald-50 text-emerald-900" },
  a_etudier: { titre: "À étudier de près", couleur: "border-amber-300 bg-amber-50 text-amber-900" },
  passer: { titre: "Mieux vaut passer", couleur: "border-rose-300 bg-rose-50 text-rose-900" },
};
