import type postgres from "postgres";

export type Compte = {
  id: string;
  email: string;
  siren: string | null;
  siret: string | null;
  nom: string | null;
};

/** Durée d'une session : le client reste connecté un mois sans avoir à redemander un lien. */
const JOURS_SESSION = 30;

export const COOKIE_SESSION = "session";

/** Adresse valable et normalisée en minuscules, ou null. */
export function normaliserEmail(brut: string): string | null {
  const email = brut.trim().toLowerCase();
  return /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/.test(email) && email.length <= 254 ? email : null;
}

/**
 * Crée le compte, ou met à jour l'entreprise suivie si l'adresse est déjà inscrite : se réinscrire
 * avec un autre SIRET change l'entreprise, cela ne crée pas un second compte.
 */
export async function creerCompte(
  sql: postgres.Sql,
  compte: { email: string; siren: string | null; siret: string | null; nom: string | null },
): Promise<Compte> {
  const [ligne] = await sql<Compte[]>`
    insert into comptes (email, siren, siret, nom)
    values (${compte.email}, ${compte.siren}, ${compte.siret}, ${compte.nom})
    on conflict (email) do update set siren = excluded.siren, siret = excluded.siret, nom = excluded.nom
    returning id, email, siren, siret, nom`;
  return ligne;
}

/** Ouvre une session et renvoie l'identifiant à déposer dans le cookie. */
export async function ouvrirSession(sql: postgres.Sql, compteId: string): Promise<string> {
  const octets = crypto.getRandomValues(new Uint8Array(32));
  const id = [...octets].map((o) => o.toString(16).padStart(2, "0")).join("");
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
