import type postgres from "postgres";
import { type TitulaireMarche, titulairesJson } from "./renouvellements";

/** Au-delà d'un milliard d'euros, un montant publié est presque toujours une erreur de saisie. */
export const MONTANT_PLAUSIBLE = 1e9;

export type Repartition = { marches: number; montant: number | null };

export type FicheAcheteur = {
  siret: string;
  nom: string | null;
  sigle: string | null;
  categorie: string | null;
  departement: string | null;
  marches: number;
  montant: number | null;
  premiere: string | null;
  derniere: string | null;
  offres_moyennes: number | null;
  marches_avec_offres: number;
  offre_unique: number;
  par_annee: (Repartition & { annee: number })[];
  divisions: (Repartition & { division: string })[];
  titulaires: (Repartition & { siren: string | null; identifiant: string; nom: string | null })[];
  renouvellements: {
    uid: string; objet: string | null; cpv: string | null; montant: number | null; date_fin_estimee: string;
    deja_relance_le: string | null; titulaires: TitulaireMarche[];
  }[];
  avis: { uid: string; type: string; objet: string; date_publication: string; date_limite: string | null; url: string }[];
};

/** Fiche d'un acheteur public : ce qu'il achète, à qui, combien, et ses prochains renouvellements. */
export async function ficheAcheteur(sql: postgres.Sql, siret: string): Promise<FicheAcheteur | null> {
  const [fiche] = await sql<FicheAcheteur[]>`
    with b as (select ${siret}::text as siret)
    select
      b.siret,
      coalesce(e.nom, a.nom, (select acheteur_nom from avis where acheteur_siret = b.siret
        order by date_publication desc limit 1)) as nom,
      e.sigle,
      cj.libelle as categorie,
      (select mode() within group (order by departement) from marches
        where acheteur_siret = b.siret and departement is not null) as departement,
      s.marches, s.montant::float as montant, s.premiere::text as premiere, s.derniere::text as derniere,
      s.offres_moyennes::float as offres_moyennes, s.marches_avec_offres, s.offre_unique,
      coalesce((select json_agg(x order by x.annee) from (
        select extract(year from date_notification)::int as annee, count(*)::int as marches,
          sum(montant) filter (where montant <= ${MONTANT_PLAUSIBLE})::float as montant
        from marches where acheteur_siret = b.siret group by 1
      ) x), '[]') as par_annee,
      coalesce((select json_agg(x) from (
        select left(cpv, 2) as division, count(*)::int as marches,
          sum(montant) filter (where montant <= ${MONTANT_PLAUSIBLE})::float as montant
        from marches where acheteur_siret = b.siret and cpv ~ '^\\d{2}'
        group by 1 order by 3 desc nulls last, 2 desc limit 8
      ) x), '[]') as divisions,
      coalesce((select json_agg(x) from (
        select max(t.siren) as siren, min(t.titulaire_id) as identifiant, max(te.nom) as nom,
          count(*)::int as marches, sum(m.montant) filter (where m.montant <= ${MONTANT_PLAUSIBLE})::float as montant
        from marches m
        join marches_titulaires t on t.marche_uid = m.uid
        left join entreprises te on te.siren = t.siren
        where m.acheteur_siret = b.siret
        group by coalesce(t.siren, t.titulaire_id)
        order by 4 desc, 5 desc nulls last limit 10
      ) x), '[]') as titulaires,
      coalesce((select json_agg(x) from (
        select r.uid, r.objet, r.cpv, r.montant::float as montant, r.date_fin_estimee::text as date_fin_estimee,
          r.deja_relance_le::text as deja_relance_le, ${titulairesJson(sql, sql`r.uid`)} as titulaires
        from renouvellements r where r.acheteur_siret = b.siret
        order by r.date_fin_estimee, r.montant desc nulls last limit 20
      ) x), '[]') as renouvellements,
      coalesce((select json_agg(x) from (
        select uid, type, objet, date_publication::text as date_publication, date_limite::text as date_limite, url
        from avis where acheteur_siret = b.siret order by date_publication desc limit 15
      ) x), '[]') as avis
    from b
    left join acheteurs a on a.siret = b.siret
    left join entreprises e on e.siren = left(b.siret, 9)
    left join categories_juridiques cj on cj.code = e.categorie_juridique
    cross join lateral (
      select count(*)::int as marches, sum(montant) filter (where montant <= ${MONTANT_PLAUSIBLE}) as montant,
        min(date_notification) as premiere, max(date_notification) as derniere,
        avg(offres_recues) as offres_moyennes, count(offres_recues)::int as marches_avec_offres,
        count(*) filter (where offres_recues = 1)::int as offre_unique
      from marches where acheteur_siret = b.siret
    ) s`;
  if (!fiche || (fiche.marches === 0 && fiche.avis.length === 0)) return null;
  return fiche;
}
