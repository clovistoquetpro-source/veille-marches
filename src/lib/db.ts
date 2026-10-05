import postgres from "postgres";

/**
 * Client PostgreSQL pour les pages serveur. `prepare: false` est requis par le pooler de Supabase
 * (mode transaction). Une connexion par requête : sur Cloudflare Workers, une connexion ne peut pas
 * être réutilisée d'une requête à l'autre.
 */
export function db(): postgres.Sql | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return postgres(url, { prepare: false, max: 1, fetch_types: false });
}
