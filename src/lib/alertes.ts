/**
 * Alertes par courriel. Chaque matin (ou chaque lundi), on envoie à chaque client les appels
 * d'offres qui viennent de paraître et les marchés qui entrent dans leur fenêtre de relance, sans
 * jamais répéter ce qu'on lui a déjà annoncé.
 */
import type postgres from "postgres";
import { jetonDeDesinscription } from "./comptes";
import { type Courriel, type Envoyeur } from "./courriel";
import { criteresProfil, profilVide } from "./correspondance";
import { euros, jour, mois } from "./format";
import { tableauPg } from "./pg";
import type { Profil } from "./profil";

export type Frequence = "quotidienne" | "hebdomadaire";

export type Destinataire = {
  compte_id: string;
  email: string;
  nom: string | null;
  jeton: string | null;
  profil: Profil;
};

export type AvisAlerte = {
  uid: string;
  objet: string;
  acheteur_nom: string | null;
  departements: string[];
  date_limite: string | null;
  url: string;
};

export type MarcheAlerte = {
  uid: string;
  /** Tous les lots regroupés sous cette ligne : on les retient tous comme annoncés. */
  uids: string[];
  nb_lots: number;
  objet: string | null;
  acheteur: string;
  acheteur_nom: string | null;
  montant: number | null;
  date_fin_estimee: string;
  titulaire: string | null;
};

/** Adresse publique du site, pour les liens des courriels. */
export function adresseSite(): string {
  return (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Clients à prévenir : ceux dont le profil peut remonter quelque chose. */
export async function destinataires(sql: postgres.Sql, frequence: Frequence): Promise<Destinataire[]> {
  return sql<Destinataire[]>`
    select c.id as compte_id, c.email, c.nom, c.jeton,
      json_build_object(
        'cpv', array_to_json(p.cpv), 'mots_cles', array_to_json(p.mots_cles),
        'departements', array_to_json(p.departements), 'origine', p.origine
      ) as profil
    from comptes c join profils p on p.compte_id = c.id
    where p.frequence = ${frequence}
      and (cardinality(p.cpv) > 0 or cardinality(p.mots_cles) > 0)
    order by c.cree_le`;
}

/** Avis parus récemment, jamais annoncés à ce client. */
export async function avisAAnnoncer(
  sql: postgres.Sql,
  compteId: string,
  profil: Profil,
  jours = 7,
  limite = 20,
): Promise<AvisAlerte[]> {
  if (profilVide(profil)) return [];
  return sql<AvisAlerte[]>`
    select av.uid, av.objet, av.acheteur_nom, array_to_json(av.departements) as departements,
      av.date_limite::text as date_limite, av.url
    from avis av
    where av.type in ('marche', 'preinformation')
      and av.date_publication >= current_date - ${jours}::integer
      and (av.date_limite is null or av.date_limite >= current_date)
      and (${criteresProfil(sql, profil, sql`av.cpv`, sql`av.objet`)})
      ${profil.departements.length > 0
        ? sql`and av.departements && ${tableauPg(profil.departements)}::text[]`
        : sql``}
      and not exists (select 1 from alertes_avis a where a.compte_id = ${compteId} and a.avis_uid = av.uid)
    order by av.date_publication desc, av.uid desc
    limit ${limite}`;
}

/**
 * Marchés qui finissent dans 6 à 12 mois : c'est la fenêtre où l'acheteur prépare sa relance, et
 * c'est tout l'intérêt du produit. Jamais annoncés deux fois au même client.
 */
export async function marchesAAnnoncer(
  sql: postgres.Sql,
  compteId: string,
  profil: Profil,
  limite = 10,
): Promise<MarcheAlerte[]> {
  if (profilVide(profil)) return [];
  return sql<MarcheAlerte[]>`
    with eligibles as (
      select r.uid, r.objet, r.acheteur_siret, r.montant, r.date_fin_estimee
      from renouvellements r
      where r.date_fin_estimee between current_date + interval '6 months' and current_date + interval '12 months'
        and (${criteresProfil(sql, profil, sql`r.cpv`, sql`r.objet`)})
        ${profil.departements.length > 0 ? sql`and r.departement = any(${tableauPg(profil.departements)}::text[])` : sql``}
        and not exists (select 1 from alertes_marches m where m.compte_id = ${compteId} and m.marche_uid = r.uid)
    ),
    -- un marché alloti paraît une fois par lot : on regroupe les lots d'un même objet chez un même acheteur
    groupes as (
      select acheteur_siret,
        (array_agg(uid order by montant desc nulls last))[1] as uid,
        array_to_json(array_agg(uid)) as uids,
        count(*)::int as nb_lots,
        min(objet) as objet,
        sum(montant)::float as montant,
        min(date_fin_estimee) as date_fin_estimee
      from eligibles group by acheteur_siret, coalesce(objet, '')
    ),
    -- au plus trois marchés par acheteur, pour qu'un gros acheteur ne remplisse pas le courriel
    classes as (
      select g.*, row_number() over (
        partition by g.acheteur_siret order by g.date_fin_estimee, g.montant desc nulls last
      ) as rang
      from groupes g
    )
    select c.uid, c.uids, c.nb_lots, c.objet, c.acheteur_siret as acheteur,
      coalesce(e.nom, ach.nom) as acheteur_nom, c.montant, c.date_fin_estimee::text as date_fin_estimee,
      (select coalesce(te.nom, t.titulaire_id) from marches_titulaires t
         left join entreprises te on te.siren = t.siren
         where t.marche_uid = c.uid order by t.titulaire_id limit 1) as titulaire
    from classes c
    left join acheteurs ach on ach.siret = c.acheteur_siret
    left join entreprises e on e.siren = left(c.acheteur_siret, 9)
    where c.rang <= 3
    order by c.date_fin_estimee, c.montant desc nulls last
    limit ${limite}`;
}

function pluriel(n: number, singulier: string, pluriel = `${singulier}s`): string {
  return `${n} ${n > 1 ? pluriel : singulier}`;
}

function echappe(texte: string): string {
  return texte.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/** Objet et corps du courriel. L'ordre suit l'intérêt : d'abord ce qui se répond tout de suite. */
export function composerAlerte(
  destinataire: Destinataire,
  avis: AvisAlerte[],
  marches: MarcheAlerte[],
  site = adresseSite(),
): Courriel {
  const morceaux = [
    avis.length > 0 && pluriel(avis.length, "appel d'offres", "appels d'offres"),
    marches.length > 0 && pluriel(marches.length, "marché à reconquérir", "marchés à reconquérir"),
  ].filter(Boolean) as string[];

  const lignesAvis = avis.map((a) => ({
    titre: a.objet,
    detail: [
      a.acheteur_nom,
      a.departements.length > 0 && `dép. ${a.departements.join(", ")}`,
      a.date_limite && `réponse avant le ${jour(a.date_limite)}`,
    ].filter(Boolean).join(" · "),
    lien: a.url,
  }));
  const lignesMarches = marches.map((m) => ({
    titre: m.objet ?? "Objet non publié",
    detail: [
      `fin estimée ${mois(m.date_fin_estimee)}`,
      m.acheteur_nom,
      m.nb_lots > 1 && `${m.nb_lots} lots`,
      m.montant && (m.nb_lots > 1 ? `${euros(m.montant)} au total` : euros(m.montant)),
      m.titulaire && `titulaire actuel : ${m.titulaire}`,
    ].filter(Boolean).join(" · "),
    lien: `${site}/acheteurs/${m.acheteur}`,
  }));

  const desinscription = destinataire.jeton ? `${site}/desinscription?jeton=${destinataire.jeton}` : `${site}/veille`;
  const section = (titre: string, lignes: typeof lignesAvis) =>
    lignes.length === 0 ? "" : `\n${titre}\n\n${lignes.map((l) => `- ${l.titre}\n  ${l.detail}\n  ${l.lien}`).join("\n\n")}\n`;

  const texte = [
    `Bonjour,`,
    "",
    `Voici ce qui concerne ${destinataire.nom ?? "votre entreprise"} :`,
    section("Appels d'offres qui viennent de paraître", lignesAvis),
    section("Marchés qui arrivent à échéance dans 6 à 12 mois", lignesMarches),
    "",
    `Votre veille : ${site}/veille`,
    `Ne plus recevoir ces courriels : ${desinscription}`,
  ].join("\n");

  const sectionHtml = (titre: string, lignes: typeof lignesAvis) =>
    lignes.length === 0 ? "" : `<h2 style="font-size:16px">${titre}</h2><ul>${lignes.map((l) =>
      `<li style="margin-bottom:10px"><a href="${echappe(l.lien)}">${echappe(l.titre)}</a>` +
      `<br><span style="color:#555;font-size:13px">${echappe(l.detail)}</span></li>`).join("")}</ul>`;

  const html = `<div style="font-family:system-ui,sans-serif;max-width:640px">` +
    `<p>Bonjour,</p><p>Voici ce qui concerne ${echappe(destinataire.nom ?? "votre entreprise")} :</p>` +
    sectionHtml("Appels d'offres qui viennent de paraître", lignesAvis) +
    sectionHtml("Marchés qui arrivent à échéance dans 6 à 12 mois", lignesMarches) +
    `<p style="color:#555;font-size:13px"><a href="${echappe(site)}/veille">Voir ma veille</a> · ` +
    `<a href="${echappe(desinscription)}">Ne plus recevoir ces courriels</a></p></div>`;

  return { a: destinataire.email, sujet: morceaux.join(" et "), texte, html };
}

export type ResultatAlertes = { envoyees: number; erreurs: number; sansNouveaute: number };

/**
 * Envoie une alerte à chaque client qui a du nouveau, et retient ce qui a été annoncé. Un envoi raté
 * n'arrête pas les autres : il est journalisé et son contenu sera repris au prochain passage.
 */
export async function envoyerAlertes(
  sql: postgres.Sql,
  envoyeur: Envoyeur,
  frequence: Frequence = "quotidienne",
): Promise<ResultatAlertes> {
  const jours = frequence === "hebdomadaire" ? 8 : 2;
  const resultat: ResultatAlertes = { envoyees: 0, erreurs: 0, sansNouveaute: 0 };
  for (const destinataire of await destinataires(sql, frequence)) {
    const [avis, marches] = await Promise.all([
      avisAAnnoncer(sql, destinataire.compte_id, destinataire.profil, jours),
      marchesAAnnoncer(sql, destinataire.compte_id, destinataire.profil),
    ]);
    if (avis.length === 0 && marches.length === 0) {
      resultat.sansNouveaute++;
      continue;
    }
    try {
      const jeton = destinataire.jeton ?? await jetonDeDesinscription(sql, destinataire.compte_id);
      await envoyeur(composerAlerte({ ...destinataire, jeton }, avis, marches));
      await sql.begin(async (tx) => {
        await tx`insert into alertes (compte_id, nb_avis, nb_renouvellements, statut)
          values (${destinataire.compte_id}, ${avis.length}, ${marches.length}, 'envoyee')`;
        if (avis.length > 0) {
          await tx`insert into alertes_avis ${tx(avis.map((a) => ({ compte_id: destinataire.compte_id, avis_uid: a.uid })))}
            on conflict do nothing`;
        }
        if (marches.length > 0) {
          const lots = marches.flatMap((m) =>
            m.uids.map((uid) => ({ compte_id: destinataire.compte_id, marche_uid: uid })),
          );
          await tx`insert into alertes_marches ${tx(lots)} on conflict do nothing`;
        }
      });
      resultat.envoyees++;
    } catch (erreur) {
      resultat.erreurs++;
      await sql`insert into alertes (compte_id, nb_avis, nb_renouvellements, statut, message)
        values (${destinataire.compte_id}, ${avis.length}, ${marches.length}, 'erreur',
          ${erreur instanceof Error ? erreur.message.slice(0, 500) : String(erreur).slice(0, 500)})`;
    }
  }
  return resultat;
}
