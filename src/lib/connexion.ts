/**
 * Connexion par adresse et mot de passe, et lien « choisir un nouveau mot de passe » par courriel.
 */
import type postgres from "postgres";
import { type Compte, fermerSessions, jetonAleatoire, normaliserEmail } from "./comptes";
import { type Courriel, type Envoyeur, logoCourriel } from "./courriel";
import { EMPREINTE_FACTICE, hacherMotDePasse, motDePasseRefuse, verifierMotDePasse } from "./motdepasse";
import { NOM } from "./produit";

/** Au cinquième essai raté d'affilée, la connexion du compte est bloquée un quart d'heure. */
const ESSAIS_MAX = 5;
const MINUTES_BLOCAGE = 15;
/** Un lien de réinitialisation sert une fois, dans l'heure. Trois demandes par heure au plus. */
const MINUTES_LIEN = 60;
const DEMANDES_PAR_HEURE = 3;

export const IDENTIFIANTS_INCORRECTS = "Adresse ou mot de passe incorrect.";
export const TROP_D_ESSAIS = `Trop d'essais ratés. Réessayez dans ${MINUTES_BLOCAGE} minutes, ou choisissez un nouveau mot de passe.`;
export const LIEN_INVALIDE = "Ce lien n'est plus valable. Demandez-en un nouveau.";

export type Resultat = { ok: true; compte: Compte } | { ok: false; erreur: string };

type Ligne = Compte & { mot_de_passe: string | null; bloque: boolean };

export async function connecter(sql: postgres.Sql, saisie: { email: string; motDePasse: string }): Promise<Resultat> {
  const email = normaliserEmail(saisie.email);
  const [ligne] = email
    ? await sql<Ligne[]>`
        select id, email, siren, siret, nom, mot_de_passe, coalesce(bloque_jusqu_au > now(), false) as bloque
        from comptes where email = ${email}`
    : [];
  if (ligne?.bloque) return { ok: false, erreur: TROP_D_ESSAIS };
  // on calcule une empreinte même sans compte : la réponse ne dit pas si l'adresse est inscrite
  const juste = await verifierMotDePasse(saisie.motDePasse, ligne?.mot_de_passe ?? EMPREINTE_FACTICE);
  if (!ligne || !ligne.mot_de_passe) return { ok: false, erreur: IDENTIFIANTS_INCORRECTS };
  if (!juste) {
    const [{ bloque }] = await sql<{ bloque: boolean }[]>`
      update comptes set
        echecs_connexion = case when echecs_connexion + 1 >= ${ESSAIS_MAX} then 0 else echecs_connexion + 1 end,
        bloque_jusqu_au = case when echecs_connexion + 1 >= ${ESSAIS_MAX}
          then now() + ${MINUTES_BLOCAGE + " minutes"}::interval else bloque_jusqu_au end
      where id = ${ligne.id}
      returning coalesce(bloque_jusqu_au > now(), false) as bloque`;
    return { ok: false, erreur: bloque ? TROP_D_ESSAIS : IDENTIFIANTS_INCORRECTS };
  }
  await sql`update comptes set echecs_connexion = 0, bloque_jusqu_au = null where id = ${ligne.id}`;
  return { ok: true, compte: { id: ligne.id, email: ligne.email, siren: ligne.siren, siret: ligne.siret, nom: ligne.nom } };
}

async function empreinte(jeton: string): Promise<string> {
  const octets = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(jeton)));
  return [...octets].map((o) => o.toString(16).padStart(2, "0")).join("");
}

export function courrielReinitialisation(email: string, lien: string): Courriel {
  const texte = [
    "Bonjour,",
    "",
    `Pour choisir un nouveau mot de passe sur ${NOM}, ouvrez ce lien dans l'heure :`,
    lien,
    "",
    "Si vous n'avez rien demandé, ignorez ce message : votre mot de passe actuel reste valable.",
  ].join("\n");
  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;line-height:1.5">` +
    logoCourriel(new URL(lien).origin) + `<p>Bonjour,</p><p>Pour choisir un nouveau mot de passe sur ${NOM}, ouvrez ce lien dans l'heure :</p>` +
    `<p><a href="${lien}" style="display:inline-block;background:#0b0b0f;color:#fff;padding:12px 22px;` +
    `border-radius:999px;text-decoration:none">Choisir un nouveau mot de passe</a></p>` +
    `<p style="color:#666;font-size:13px">Si vous n'avez rien demandé, ignorez ce message : votre mot de passe actuel reste valable.</p></div>`;
  return { a: email, sujet: `Votre nouveau mot de passe ${NOM}`, texte, html };
}

/**
 * Envoie un lien de réinitialisation si l'adresse est inscrite. Ne dit jamais si elle l'est :
 * la page affiche le même message dans tous les cas.
 */
export async function demanderReinitialisation(
  sql: postgres.Sql,
  saisie: { email: string; site: string },
  envoyer: Envoyeur,
): Promise<void> {
  const email = normaliserEmail(saisie.email);
  if (!email) return;
  const [compte] = await sql<{ id: string; recentes: number }[]>`
    select c.id, (select count(*)::int from reinitialisations r
                  where r.compte_id = c.id and r.cree_le > now() - interval '1 hour') as recentes
    from comptes c where c.email = ${email}`;
  if (!compte || compte.recentes >= DEMANDES_PAR_HEURE) return;
  const jeton = jetonAleatoire();
  await sql`
    insert into reinitialisations (jeton_hash, compte_id, expire_le)
    values (${await empreinte(jeton)}, ${compte.id}, now() + ${MINUTES_LIEN + " minutes"}::interval)`;
  const lien = `${saisie.site.replace(/\/$/, "")}/connexion/nouveau?jeton=${jeton}`;
  await envoyer(courrielReinitialisation(email, lien));
}

/** Vrai si le lien peut encore servir (la page l'affiche avant de demander le mot de passe). */
export async function lienValable(sql: postgres.Sql, jeton: string): Promise<boolean> {
  const [ligne] = await sql`
    select 1 from reinitialisations where jeton_hash = ${await empreinte(jeton)} and expire_le > now()`;
  return ligne !== undefined;
}

/**
 * Enregistre le nouveau mot de passe. Le lien ne sert qu'une fois, et les autres sessions du compte
 * sont fermées : quelqu'un qui connaissait l'ancien mot de passe n'est plus connecté.
 */
export async function reinitialiserMotDePasse(
  sql: postgres.Sql,
  saisie: { jeton: string; motDePasse: string },
): Promise<Resultat> {
  const refus = motDePasseRefuse(saisie.motDePasse);
  if (refus) return { ok: false, erreur: refus };
  const nouveau = await hacherMotDePasse(saisie.motDePasse);
  const hache = await empreinte(saisie.jeton);
  const compte = await sql.begin(async (tx) => {
    const [lien] = await tx<{ compte_id: string }[]>`
      delete from reinitialisations where jeton_hash = ${hache} and expire_le > now() returning compte_id`;
    if (!lien) return null;
    await tx`delete from reinitialisations where compte_id = ${lien.compte_id}`;
    const [ligne] = await tx<Compte[]>`
      update comptes set mot_de_passe = ${nouveau}, echecs_connexion = 0, bloque_jusqu_au = null
      where id = ${lien.compte_id}
      returning id, email, siren, siret, nom`;
    return ligne ?? null;
  });
  if (!compte) return { ok: false, erreur: LIEN_INVALIDE };
  await fermerSessions(sql, compte.id);
  return { ok: true, compte };
}
