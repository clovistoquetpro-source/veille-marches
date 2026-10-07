/**
 * Appels à l'API Claude (Anthropic) : réponse JSON imposée par un schéma, et dépôt de fichiers.
 * Les modèles récents refusent qu'on force l'appel d'un outil (`tool_choice`) : on demande donc
 * directement une réponse au format JSON (`output_config.format`), que l'API garantit conforme.
 */

/** Adresse de l'API ; remplaçable par une fausse API en local pour essayer le site sans clé. */
export function urlApi(chemin: string): string {
  return `${process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com"}${chemin}`;
}

function entetes(cle: string): Record<string, string> {
  return { "x-api-key": cle, "anthropic-version": "2023-06-01" };
}

export type BlocContenu =
  | { type: "text"; text: string }
  | { type: "document"; source: { type: "file"; file_id: string }; title?: string };

export type Consommation = { entree: number; sortie: number };

/**
 * Pose une question et lit la réponse au format imposé par `schema`. Renvoie null si l'API échoue,
 * refuse de répondre ou coupe sa réponse : l'appelant décide alors quoi montrer.
 */
export async function demanderJson<T>({ cle, modele, contenu, schema, maxTokens, effort, delai }: {
  cle: string;
  modele: string;
  contenu: string | BlocContenu[];
  schema: object;
  maxTokens: number;
  effort?: "low" | "medium" | "high";
  /** Délai maximal en millisecondes. */
  delai: number;
}): Promise<{ donnees: T; consommation: Consommation } | null> {
  try {
    const reponse = await fetch(urlApi("/v1/messages"), {
      method: "POST",
      headers: { "content-type": "application/json", ...entetes(cle) },
      body: JSON.stringify({
        model: modele,
        max_tokens: maxTokens,
        output_config: { format: { type: "json_schema", schema }, ...(effort ? { effort } : {}) },
        messages: [{ role: "user", content: contenu }],
      }),
      signal: AbortSignal.timeout(delai),
    });
    if (!reponse.ok) {
      console.error(`API Claude : ${reponse.status} ${(await reponse.text()).slice(0, 500)}`);
      return null;
    }
    const corps = (await reponse.json()) as {
      stop_reason?: string;
      content?: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    // une réponse refusée ou coupée ne respecte pas forcément le schéma
    if (corps.stop_reason === "refusal" || corps.stop_reason === "max_tokens") return null;
    const texte = corps.content?.find((bloc) => bloc.type === "text")?.text;
    if (!texte) return null;
    return {
      donnees: JSON.parse(texte) as T,
      consommation: { entree: corps.usage?.input_tokens ?? 0, sortie: corps.usage?.output_tokens ?? 0 },
    };
  } catch (erreur) {
    console.error("API Claude injoignable ou réponse illisible", erreur);
    return null;
  }
}

/**
 * Transmet tel quel à l'API Files un envoi de formulaire qui contient un seul champ « file ».
 * Le fichier passe sans être relu ni recopié par le site, ce qui ménage le temps de calcul
 * très court de l'offre gratuite de Cloudflare.
 */
export async function deposerFichier(
  cle: string,
  corps: ReadableStream<Uint8Array> | Blob,
  typeDeContenu: string,
): Promise<{ id: string; nom: string; taille: number; type: string } | null> {
  try {
    const reponse = await fetch(urlApi("/v1/files"), {
      method: "POST",
      headers: { "content-type": typeDeContenu, ...entetes(cle) },
      body: corps,
      // un corps en flux doit le dire explicitement à fetch
      ...(corps instanceof Blob ? {} : { duplex: "half" }),
      signal: AbortSignal.timeout(120_000),
    } as RequestInit);
    if (!reponse.ok) {
      console.error(`Dépôt de fichier refusé : ${reponse.status} ${(await reponse.text()).slice(0, 500)}`);
      return null;
    }
    const fichier = (await reponse.json()) as { id: string; filename: string; size_bytes: number; mime_type: string };
    return { id: fichier.id, nom: fichier.filename, taille: fichier.size_bytes, type: fichier.mime_type };
  } catch (erreur) {
    console.error("Dépôt de fichier impossible", erreur);
    return null;
  }
}

/** Efface un fichier déposé ; une erreur est sans conséquence (le fichier reste stocké chez Anthropic). */
export async function supprimerFichier(cle: string, id: string): Promise<void> {
  await fetch(urlApi(`/v1/files/${encodeURIComponent(id)}`), {
    method: "DELETE",
    headers: entetes(cle),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
}
