/**
 * Veille des concurrents : le client suit des entreprises et voit ce qu'elles gagnent, que ce soit
 * par un avis d'attribution (BOAMP, TED) ou par les données essentielles (DECP), qui arrivent plus
 * tard mais couvrent bien plus de marchés. Les avis du BOAMP donnent rarement le SIRET du titulaire :
 * on les rapproche alors par le nom (voir `nom_simplifie` dans db/migrations/007_concurrents.sql).
 */
import type postgres from "postgres";
import { chercherEntreprise, INDISPONIBLE } from "./annuaire";
import { criteresProfil, profilVide } from "./correspondance";
import { tableauPg } from "./pg";
import type { Profil } from "./profil";

/** Au-delà, la veille devient une revue de presse : on limite le nombre d'entreprises suivies. */
export const MAX_CONCURRENTS = 20;

/** Un avis d'attribution reste annonçable un mois ; un marché des DECP trois mois, car elles paraissent en retard. */
const JOURS_AVIS = 30;
const JOURS_MARCHES = 90;

export type Concurrent = {
  siren: string;
  nom: string | null;
  /** Marchés gagnés dans les 12 derniers mois, d'après les DECP. */
  marches_12_mois: number;
  dernier_marche: string | null;
  /** Ses marchés de services et fournitures qui finissent dans les 12 mois : ceux qu'on peut lui reprendre. */
  echeances: number;
};

export type Gain = {
  /** `avis` : appris par un avis d'attribution ; `marche` : par les DECP. */
  source: "avis" | "marche";
  uid: string;
  /** Tous les lots regroupés sous cette ligne : on les retient tous comme annoncés. */
  uids: string[];
  nb_lots: number;
  siren: string;
  entreprise: string | null;
  objet: string | null;
  acheteur_siret: string | null;
  acheteur_nom: string | null;
  montant: number | null;
  /** Publication de l'avis d'attribution, ou notification du marché. */
  date: string;
  /** Avis officiel ; les DECP n'en ont pas. */
  url: string | null;
};

export type Suggestion = { siren: string; nom: string | null; acheteurs: number; marches: number };

/** Entreprises suivies par le client, avec de quoi juger de leur activité. */
export async function concurrentsDuCompte(sql: postgres.Sql, compteId: string): Promise<Concurrent[]> {
  return sql<Concurrent[]>`
    select c.siren, coalesce(e.nom, c.nom) as nom, s.marches_12_mois, s.dernier_marche::text as dernier_marche,
      s.echeances
    from concurrents c
    left join entreprises e on e.siren = c.siren
    cross join lateral (
      select
        count(*) filter (where m.date_notification >= current_date - interval '12 months')::int as marches_12_mois,
        max(m.date_notification) as dernier_marche,
        count(*) filter (
          where m.renouvelable and m.date_fin_estimee between current_date and current_date + interval '12 months'
        )::int as echeances
      from marches_titulaires t join marches m on m.id = t.marche_id
      where t.siren = c.siren
    ) s
    where c.compte_id = ${compteId}
    order by coalesce(e.nom, c.nom), c.siren`;
}

export async function estSuivie(sql: postgres.Sql, compteId: string, siren: string): Promise<boolean> {
  const [ligne] = await sql`select 1 from concurrents where compte_id = ${compteId} and siren = ${siren}`;
  return ligne !== undefined;
}

export type ResultatSuivi = { ok: true; nom: string | null } | { ok: false; erreur: string };

/**
 * Suit une entreprise. Son nom vient de notre base Sirene, ou de l'annuaire pour une entreprise qui
 * n'a encore rien gagné de visible : c'est ce nom qui permet de la reconnaître dans les avis du BOAMP.
 */
export async function suivreEntreprise(
  sql: postgres.Sql,
  compteId: string,
  identifiant: string,
  annuaire = chercherEntreprise,
): Promise<ResultatSuivi> {
  const numero = identifiant.replace(/\s/g, "");
  if (!/^\d{9}(\d{5})?$/.test(numero)) return { ok: false, erreur: "Indiquez un SIREN (9 chiffres) ou un SIRET (14 chiffres)." };
  const siren = numero.slice(0, 9);
  const [{ suivis, deja }] = await sql<{ suivis: number; deja: boolean }[]>`
    select count(*)::int as suivis, bool_or(siren = ${siren}) as deja from concurrents where compte_id = ${compteId}`;
  if (deja) return { ok: true, nom: null };
  if (suivis >= MAX_CONCURRENTS) {
    return { ok: false, erreur: `Vous suivez déjà ${MAX_CONCURRENTS} entreprises : retirez-en une pour en ajouter une autre.` };
  }
  const [connue] = await sql<{ nom: string | null; diffusible: boolean }[]>`
    select nom, diffusible from entreprises where siren = ${siren}`;
  let nom = connue?.diffusible ? connue.nom : null;
  if (!connue) {
    const fiche = await annuaire(siren);
    if (fiche === INDISPONIBLE) return { ok: false, erreur: "L'annuaire des entreprises ne répond pas : réessayez dans une minute." };
    if (!fiche) return { ok: false, erreur: "Ce numéro ne correspond à aucune entreprise connue." };
    nom = fiche.nom;
  }
  await sql`insert into concurrents (compte_id, siren, nom) values (${compteId}, ${siren}, ${nom})
    on conflict do nothing`;
  // ses gains déjà connus s'affichent tout de suite sur la page de veille : les alertes ne porteront
  // que sur les suivants, sans rattraper trois mois d'historique au fil des jours
  const connus = await gainsDesConcurrents(sql, compteId, { siren, limite: 1000 });
  if (connus.length > 0) {
    await sql`insert into alertes_gains ${sql(connus.flatMap((g) =>
      g.uids.map((uid) => ({ compte_id: compteId, source: g.source, uid }))))}
      on conflict do nothing`;
  }
  return { ok: true, nom };
}

export async function nePlusSuivre(sql: postgres.Sql, compteId: string, siren: string): Promise<void> {
  await sql`delete from concurrents where compte_id = ${compteId} and siren = ${siren}`;
}

/** Mots d'une recherche, en majuscules sans accents comme les noms de la base Sirene. */
export function motsDeRecherche(texte: string): string[] {
  return [...new Set(
    texte.normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase().split(/[^A-Z0-9]+/).filter((m) => m.length >= 2),
  )].slice(0, 5);
}

/**
 * Entreprises dont le nom a un mot qui commence par chacun des mots cherchés (« onet » trouve
 * ONET SERVICES, pas PROMONET), parmi celles qui ont déjà gagné un marché, les plus actives d'abord.
 */
export async function chercherConcurrents(sql: postgres.Sql, texte: string, limite = 8): Promise<Suggestion[]> {
  const mots = motsDeRecherche(texte);
  if (mots.length === 0) return [];
  return sql<Suggestion[]>`
    with candidats as (
      select e.siren, e.nom, (select count(*) from marches_titulaires t where t.siren = e.siren)::int as marches
      from entreprises e
      where e.diffusible and (' ' || e.nom) like all (${tableauPg(mots.map((m) => `% ${m}%`))}::text[])
    ),
    meilleurs as (
      select * from candidats where marches > 0 order by marches desc, nom limit ${limite}
    )
    select m.siren, m.nom,
      (select count(distinct ma.acheteur_siret)::int from marches_titulaires t join marches ma on ma.id = t.marche_id
        where t.siren = m.siren) as acheteurs,
      m.marches
    from meilleurs m
    order by m.marches desc, m.nom`;
}

/**
 * Entreprises qui gagnent le plus souvent les marchés du profil depuis deux ans, chez le plus grand
 * nombre d'acheteurs : les concurrents probables du client, à lui proposer de suivre. Un profil très
 * étroit (un seul code CPV fin dans un département) peut ne rien donner : on élargit alors les codes
 * CPV à leur groupe, puis à toute la France.
 */
export async function concurrentsProbables(
  sql: postgres.Sql,
  compteId: string,
  profil: Profil,
  sirenDuClient: string | null,
  limite = 5,
): Promise<Suggestion[]> {
  if (profilVide(profil)) return [];
  const groupes = { ...profil, cpv: [...new Set(profil.cpv.map((c) => c.slice(0, 3)))] };
  const essais = [profil, groupes, { ...groupes, departements: [] }].filter((p, i, tous) =>
    i === 0 || JSON.stringify(p) !== JSON.stringify(tous[i - 1]));
  for (const essai of essais) {
    const suggestions = await suggestionsDuProfil(sql, compteId, essai, sirenDuClient, limite);
    if (suggestions.length > 0) return suggestions;
  }
  return [];
}

async function suggestionsDuProfil(
  sql: postgres.Sql,
  compteId: string,
  profil: Profil,
  sirenDuClient: string | null,
  limite: number,
): Promise<Suggestion[]> {
  return sql<Suggestion[]>`
    select t.siren, max(e.nom) as nom, count(distinct m.acheteur_siret)::int as acheteurs, count(*)::int as marches
    from marches m
    join marches_titulaires t on t.marche_id = m.id
    join entreprises e on e.siren = t.siren
    where m.date_notification >= current_date - interval '2 years'
      and (${criteresProfil(sql, profil, sql`m.cpv`, sql`m.objet`)})
      ${profil.departements.length > 0 ? sql`and m.departement = any(${tableauPg(profil.departements)}::text[])` : sql``}
      and e.active and e.diffusible
      and t.siren is distinct from ${sirenDuClient}
      and not exists (select 1 from concurrents c where c.compte_id = ${compteId} and c.siren = t.siren)
    group by t.siren
    order by 3 desc, 4 desc
    limit ${limite}`;
}

/**
 * Derniers marchés gagnés par les entreprises suivies, les plus récents d'abord. Un marché déjà connu
 * par un avis d'attribution du même acheteur n'est pas répété quand il arrive ensuite dans les DECP,
 * et les lots d'un même marché sont regroupés. `nonAnnonces` écarte ce qu'on a déjà écrit au client,
 * `siren` limite la recherche à l'une des entreprises suivies.
 */
export async function gainsDesConcurrents(
  sql: postgres.Sql,
  compteId: string,
  { limite = 30, nonAnnonces = false, siren }: { limite?: number; nonAnnonces?: boolean; siren?: string } = {},
): Promise<Gain[]> {
  const dejaAnnonce = (source: "avis" | "marche", uid: postgres.Fragment) => nonAnnonces
    ? sql`and not exists (select 1 from alertes_gains g
        where g.compte_id = ${compteId} and g.source = ${source} and g.uid = ${uid})`
    : sql``;
  return sql<Gain[]>`
    with suivis as (
      select c.siren, coalesce(e.nom, c.nom) as nom, nom_simplifie(coalesce(e.nom, c.nom)) as cle
      from concurrents c left join entreprises e on e.siren = c.siren
      where c.compte_id = ${compteId} ${siren ? sql`and c.siren = ${siren}` : sql``}
    ),
    -- titulaire reconnu par son SIREN, ou à défaut par son nom (au moins quatre lettres, pour éviter les homonymes)
    titulaires_suivis as (
      select t.avis_uid, s.siren, s.nom
      from avis_titulaires t join suivis s on s.siren = t.siren
      union
      select t.avis_uid, s.siren, s.nom
      from avis_titulaires t join suivis s on t.siren is null and length(s.cle) >= 4 and nom_simplifie(t.nom) = s.cle
    ),
    par_avis as (
      select distinct on (av.uid, ts.siren) 'avis' as source, av.uid, json_build_array(av.uid) as uids, 1 as nb_lots,
        ts.siren, ts.nom as entreprise, av.objet, av.acheteur_siret, av.acheteur_nom, av.montant::float as montant,
        av.date_publication as date, av.url
      from titulaires_suivis ts join avis av on av.uid = ts.avis_uid
      where av.type = 'attribution' and av.date_publication >= current_date - ${JOURS_AVIS}::integer
        ${dejaAnnonce("avis", sql`av.uid`)}
    ),
    lots as (
      select m.uid, s.siren, s.nom, m.objet, m.acheteur_siret, m.montant, m.date_notification
      from suivis s
      join marches_titulaires t on t.siren = s.siren
      join marches m on m.id = t.marche_id
      where m.date_notification >= current_date - ${JOURS_MARCHES}::integer
        ${dejaAnnonce("marche", sql`m.uid`)}
        and not exists (
          select 1 from titulaires_suivis ts join avis av on av.uid = ts.avis_uid
          where ts.siren = s.siren and av.type = 'attribution' and av.acheteur_siret = m.acheteur_siret
            and av.date_publication between m.date_notification - 15 and m.date_notification + 120
        )
    ),
    par_marche as (
      select 'marche' as source, (array_agg(l.uid order by l.montant desc nulls last))[1] as uid,
        array_to_json(array_agg(l.uid)) as uids, count(*)::int as nb_lots, l.siren, min(l.nom) as entreprise,
        min(l.objet) as objet, l.acheteur_siret, null::text as acheteur_nom, sum(l.montant)::float as montant,
        max(l.date_notification) as date, null::text as url
      from lots l group by l.siren, l.acheteur_siret, coalesce(l.objet, '')
    ),
    tous as (select * from par_avis union all select * from par_marche)
    select g.source, g.uid, g.uids, g.nb_lots, g.siren, g.entreprise, g.objet, g.acheteur_siret,
      coalesce(g.acheteur_nom, ea.nom, a.nom) as acheteur_nom, g.montant, g.date::text as date, g.url
    from tous g
    left join acheteurs a on a.siret = g.acheteur_siret
    left join entreprises ea on ea.siren = left(g.acheteur_siret, 9)
    order by g.date desc, g.montant desc nulls last, g.uid
    limit ${limite}`;
}
