import type postgres from "postgres";
import { MONTANT_PLAUSIBLE, type Repartition } from "./acheteurs";

export type FicheEntreprise = {
  siren: string;
  nom: string | null;
  sigle: string | null;
  /** false : entrepreneur individuel qui refuse la diffusion de ses données (nom masqué). */
  diffusible: boolean | null;
  active: boolean | null;
  categorie_juridique: string | null;
  naf: string | null;
  naf_libelle: string | null;
  tranche_effectif: string | null;
  categorie: string | null;
  date_creation: string | null;
  marches: number;
  nb_acheteurs: number;
  montant: number | null;
  premiere: string | null;
  derniere: string | null;
  par_annee: (Repartition & { annee: number })[];
  divisions: (Repartition & { division: string })[];
  acheteurs: (Repartition & { siret: string; nom: string | null })[];
  /** Marchés qu'elle détient et qui arrivent à échéance dans les 12 mois : ceux qu'on peut lui disputer. */
  echeances: {
    uid: string; objet: string | null; cpv: string | null; montant: number | null; date_fin_estimee: string;
    acheteur_siret: string; acheteur_nom: string | null; deja_relance_le: string | null;
  }[];
  attributions: {
    uid: string; objet: string; acheteur_nom: string | null; acheteur_siret: string | null;
    date_publication: string; montant: number | null; url: string;
  }[];
};

/** Fiche d'une entreprise titulaire : marchés gagnés, acheteurs, et marchés qui arrivent à échéance. */
export async function ficheEntreprise(sql: postgres.Sql, siren: string): Promise<FicheEntreprise | null> {
  const [fiche] = await sql<FicheEntreprise[]>`
    with b as (select ${siren}::text as siren),
    gagnes as (
      select distinct m.id, m.acheteur_siret, m.cpv, m.montant, m.date_notification
      from marches_titulaires t join marches m on m.id = t.marche_id
      where t.siren = ${siren}
    )
    select
      b.siren,
      case when coalesce(e.diffusible, true) then coalesce(e.nom, (select nom from avis_titulaires
        where siren = b.siren and nom is not null limit 1)) end as nom,
      e.sigle, e.diffusible, e.active, cj.libelle as categorie_juridique, e.naf, n.libelle as naf_libelle,
      e.tranche_effectif, e.categorie, e.date_creation::text as date_creation,
      s.marches, s.nb_acheteurs, s.montant::float as montant, s.premiere::text as premiere, s.derniere::text as derniere,
      coalesce((select json_agg(x order by x.annee) from (
        select extract(year from date_notification)::int as annee, count(*)::int as marches,
          sum(montant) filter (where montant <= ${MONTANT_PLAUSIBLE})::float as montant
        from gagnes group by 1
      ) x), '[]') as par_annee,
      coalesce((select json_agg(x) from (
        select left(cpv, 2) as division, count(*)::int as marches,
          sum(montant) filter (where montant <= ${MONTANT_PLAUSIBLE})::float as montant
        from gagnes where cpv ~ '^\\d{2}' group by 1 order by 3 desc nulls last, 2 desc limit 8
      ) x), '[]') as divisions,
      coalesce((select json_agg(x) from (
        select g.acheteur_siret as siret, max(coalesce(ea.nom, a.nom)) as nom, count(*)::int as marches,
          sum(g.montant) filter (where g.montant <= ${MONTANT_PLAUSIBLE})::float as montant
        from gagnes g
        left join acheteurs a on a.siret = g.acheteur_siret
        left join entreprises ea on ea.siren = left(g.acheteur_siret, 9)
        group by g.acheteur_siret order by 3 desc, 4 desc nulls last limit 10
      ) x), '[]') as acheteurs,
      coalesce((select json_agg(x) from (
        select r.uid, r.objet, r.cpv, r.montant::float as montant, r.date_fin_estimee::text as date_fin_estimee,
          r.acheteur_siret, coalesce(ea.nom, a.nom) as acheteur_nom, r.deja_relance_le::text as deja_relance_le
        from renouvellements r
        left join acheteurs a on a.siret = r.acheteur_siret
        left join entreprises ea on ea.siren = left(r.acheteur_siret, 9)
        where r.id in (select id from gagnes)
        order by r.date_fin_estimee, r.montant desc nulls last limit 30
      ) x), '[]') as echeances,
      coalesce((select json_agg(x) from (
        select distinct on (av.date_publication, av.uid) av.uid, av.objet, av.acheteur_nom, av.acheteur_siret,
          av.date_publication::text as date_publication, av.montant::float as montant, av.url
        from avis_titulaires t join avis av on av.uid = t.avis_uid
        where t.siren = b.siren
        order by av.date_publication desc, av.uid limit 15
      ) x), '[]') as attributions
    from b
    left join entreprises e on e.siren = b.siren
    left join categories_juridiques cj on cj.code = e.categorie_juridique
    left join naf n on n.code = e.naf
    cross join lateral (
      select count(*)::int as marches, count(distinct acheteur_siret)::int as nb_acheteurs, sum(montant) filter (where montant <= ${MONTANT_PLAUSIBLE}) as montant,
        min(date_notification) as premiere, max(date_notification) as derniere
      from gagnes
    ) s`;
  if (!fiche || (fiche.marches === 0 && fiche.attributions.length === 0 && fiche.diffusible === null)) return null;
  return fiche;
}
