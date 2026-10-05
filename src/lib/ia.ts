/**
 * Déduction du profil de veille par l'IA, pour les entreprises qui n'ont pas encore gagné assez de
 * marchés publics pour qu'on devine ce qu'elles cherchent. On force une réponse structurée (outil
 * Anthropic) puis on la filtre : seuls des préfixes CPV, des mots-clés courts et des départements
 * connus sont retenus, et une erreur de l'API n'empêche jamais l'inscription.
 */
import { DIVISIONS_CPV } from "./nomenclatures";
import { nettoyerProfil, type Profil } from "./profil";

const API = "https://api.anthropic.com/v1/messages";
const MODELE = "claude-sonnet-5-5";

const OUTIL = {
  name: "profil_de_veille",
  description: "Enregistre les marchés publics qui intéressent cette entreprise.",
  input_schema: {
    type: "object",
    properties: {
      cpv: {
        type: "array",
        items: { type: "string" },
        description: "Préfixes de codes CPV, de 2 à 8 chiffres, du plus pertinent au moins pertinent (6 au maximum).",
      },
      mots_cles: {
        type: "array",
        items: { type: "string" },
        description: "Mots que l'on retrouve dans l'objet des avis qui l'intéressent (5 au maximum).",
      },
    },
    required: ["cpv", "mots_cles"],
  },
} as const;

export type EntrepriseAProfiler = {
  nom: string | null;
  naf_libelle: string | null;
  /** Objets de ses marchés déjà gagnés, s'il y en a. */
  objets?: string[];
};

function consigne(e: EntrepriseAProfiler): string {
  const divisions = Object.entries(DIVISIONS_CPV).map(([code, libelle]) => `${code} ${libelle}`).join("\n");
  return [
    "Tu prépares la veille des marchés publics français d'une entreprise.",
    "",
    `Entreprise : ${e.nom ?? "nom inconnu"}`,
    `Activité déclarée (Insee) : ${e.naf_libelle ?? "inconnue"}`,
    e.objets?.length ? `Marchés publics déjà gagnés :\n- ${e.objets.slice(0, 10).join("\n- ")}` : "",
    "",
    "Divisions CPV disponibles :",
    divisions,
    "",
    "Choisis les codes CPV qui correspondent à ce qu'elle peut vendre à un acheteur public : des codes",
    "précis (5 à 8 chiffres) quand l'activité est claire, la division (2 chiffres) quand elle est large.",
    "Les mots-clés sont au singulier, en minuscules, sans accent inutile, et doivent apparaître tels",
    "quels dans l'objet d'un avis. N'invente pas de métier qui ne découle pas de l'activité déclarée.",
  ].filter(Boolean).join("\n");
}

/**
 * Profil proposé par l'IA, ou null si la clé n'est pas configurée ou si l'API ne répond pas.
 * `cle` et `modele` ne sont là que pour les tests ; en production ils viennent de l'environnement.
 */
export async function profilParIa(
  e: EntrepriseAProfiler,
  cle = process.env.ANTHROPIC_API_KEY,
  modele = process.env.MODELE_IA ?? MODELE,
): Promise<Profil | null> {
  if (!cle) return null;
  try {
    const reponse = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": cle, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: modele,
        max_tokens: 1024,
        tools: [OUTIL],
        tool_choice: { type: "tool", name: OUTIL.name },
        messages: [{ role: "user", content: consigne(e) }],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!reponse.ok) return null;
    const corps = (await reponse.json()) as { content?: { type: string; name?: string; input?: unknown }[] };
    const outil = corps.content?.find((bloc) => bloc.type === "tool_use" && bloc.name === OUTIL.name);
    const propose = outil?.input as Partial<Profil> | undefined;
    if (!propose) return null;
    const { cpv, mots_cles } = nettoyerProfil(propose);
    if (cpv.length === 0 && mots_cles.length === 0) return null;
    return { cpv: cpv.slice(0, 6), mots_cles: mots_cles.slice(0, 5), departements: [], origine: "ia" };
  } catch {
    return null; // l'inscription se poursuit avec le profil de repli
  }
}
