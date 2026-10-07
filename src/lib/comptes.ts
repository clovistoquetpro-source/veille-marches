import type postgres from "postgres";

export type Compte = {
  id: string;
  email: string;
  siren: string | null;
  siret: string | null;
  nom: string | null;
};

/** Durée d'une session : le client reste connecté un mois sans retaper son mot de passe. */
const JOURS_SESSION = 30;

export const COOKIE_SESSION = "session";

/** Identifiant tiré au sort (session, lien de désinscription). */
export function jetonAleatoire(octets = 32): string {
  return [...crypto.getRandomValues(new Uint8Array(octets))].map((o) => o.toString(16).padStart(2, "0")).join("");
}

/** Adresse valable et normalisée en minuscules, ou null. */
export function normaliserEmail(brut: string): string | null {
  const email = brut.trim().toLowerCase();
  return /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/.test(email) && email.length <= 254 ? email : null;
}

/** Vrai si un compte porte déjà cette adresse (normalisée). */
export async function adresseInscrite(sql: postgres.Sql, email: string): Promise<boolean> {
  const [ligne] = await sql`select 1 from comptes where email = ${email}`;
  return ligne !== undefined;
}

/**
 * Crée le compte, ou renvoie null si l'adresse est déjà inscrite : une inscription ne doit jamais
 * prendre la main sur le compte de quelqu'un d'autre. `motDePasse` est l'empreinte, pas le mot de passe.
 */
export async function creerCompte(
  sql: postgres.Sql,
  compte: { email: string; siren: string | null; siret: string | null; nom: string | null; motDePasse?: string | null },
): Promise<Compte | null> {
  const [ligne] = await sql<Compte[]>`
    insert into comptes (email, siren, siret, nom, jeton, mot_de_passe)
    values (${compte.email}, ${compte.siren}, ${compte.siret}, ${compte.nom}, ${jetonAleatoire(16)},
      ${compte.motDePasse ?? null})
    on conflict (email) do nothing
    returning id, email, siren, siret, nom`;
  return ligne ?? null;
}

/** Ouvre une session et renvoie l'identifiant à déposer dans le cookie. */
export async function ouvrirSession(sql: postgres.Sql, compteId: string): Promise<string> {
  const id = jetonAleatoire();
  await sql`
    insert into sessions (id, compte_id, expire_le)
    values (${id}, ${compteId}, now() + ${JOURS_SESSION + " days"}::interval)`;
  return id;
}

/** Compte connecté, ou null si la session est inconnue ou expirée. */
export async function compteDeLaSession(sql: postgres.Sql, session: string | undefined): Promise<Compte | null> {
  if (!session) return null;
  const [ligne] = await sql<Compte[]>`
    select c.id, c.email, c.siren, c.siret, c.nom
    from sessions s join comptes c on c.id = s.compte_id
    where s.id = ${session} and s.expire_le > now()`;
  return ligne ?? null;
}

export async function fermerSession(sql: postgres.Sql, session: string): Promise<void> {
  await sql`delete from sessions where id = ${session}`;
}

/** Ferme toutes les sessions du compte, par exemple après un changement de mot de passe. */
export async function fermerSessions(sql: postgres.Sql, compteId: string): Promise<void> {
  await sql`delete from sessions where compte_id = ${compteId}`;
}

/** Jeton de désinscription du compte, créé au besoin (les comptes d'avant les alertes n'en ont pas). */
export async function jetonDeDesinscription(sql: postgres.Sql, compteId: string): Promise<string> {
  const [ligne] = await sql<{ jeton: string }[]>`
    update comptes set jeton = coalesce(jeton, ${jetonAleatoire(16)}) where id = ${compteId} returning jeton`;
  return ligne.jeton;
}

/** Coupe les alertes d'un compte à partir du jeton de son lien de désinscription. */
export async function desinscrire(sql: postgres.Sql, jeton: string): Promise<boolean> {
  const lignes = await sql`
    update profils set frequence = 'aucune', maj_le = now()
    where compte_id = (select id from comptes where jeton = ${jeton})`;
  return lignes.count > 0;
}
