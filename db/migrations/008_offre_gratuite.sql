-- Tenir dans les 500 Mo de l'offre gratuite de Supabase : les marchés passent d'une clé texte
-- (« acheteur-identifiant ») à une clé entière, et perdent les colonnes que le site n'affiche pas
-- (identifiant, nature, procédure, source, format, qui restent dans le nettoyage DuckDB).
-- Les tables sont recréées vides : le prochain import des DECP les remplit.

drop view renouvellements;
drop table marches_titulaires;
drop table marches;

-- Colonnes de taille fixe d'abord : PostgreSQL n'a pas à les aligner.
create table marches (
  id                integer primary key,
  date_notification date not null,
  date_fin_estimee  date,
  duree_mois        integer check (duree_mois between 1 and 120),
  offres_recues     integer,
  -- false pour les travaux et la maîtrise d'œuvre (CPV 45 et 71) : leur fin ne prédit pas de relance
  renouvelable      boolean not null,
  -- acheteur et identifiant du marché : un identifiant peut être réutilisé par deux acheteurs.
  -- Il reste stable d'un import à l'autre, contrairement à `id`, et sert à ne jamais annoncer deux fois un marché.
  uid               text not null,
  acheteur_siret    text not null,
  objet             text,
  cpv               text,
  -- travaux (CPV 45), fournitures (CPV 03 à 44) ou services (le reste)
  famille           text not null check (famille in ('travaux', 'fournitures', 'services')),
  montant           numeric,
  departement       text,
  -- empreinte du contenu et des titulaires : l'import ne réécrit que les marchés qui ont changé
  empreinte         uuid not null
);

create index marches_fin_idx on marches (date_fin_estimee) where renouvelable;
create index marches_acheteur_cpv_idx on marches (acheteur_siret, left(cpv, 5), date_notification);
create index marches_departement_idx on marches (departement);

create table marches_titulaires (
  marche_id        integer not null references marches (id) on delete cascade,
  titulaire_id     text not null,
  type_identifiant text,
  siren            text generated always as (
    case
      when type_identifiant = 'SIRET' and titulaire_id ~ '^\d{14}$' then left(titulaire_id, 9)
      -- certains acheteurs publient le SIREN (9 chiffres) à la place du SIRET
      when type_identifiant in ('SIRET', 'SIREN') and titulaire_id ~ '^\d{9}$' then titulaire_id
    end
  ) stored
);

create index marches_titulaires_marche_idx on marches_titulaires (marche_id);
create index marches_titulaires_siren_idx on marches_titulaires (siren);

-- Marchés de services et fournitures qui arrivent à échéance dans les 12 prochains mois.
-- `deja_relance_le` : date du dernier marché du même acheteur et de la même classe CPV notifié dans
-- les 18 mois qui précèdent la fin, signe que la relance a probablement déjà eu lieu.
create view renouvellements as
select
  m.*,
  (m.date_fin_estimee - current_date) as jours_restants,
  (
    select max(n.date_notification)
    from marches n
    where n.acheteur_siret = m.acheteur_siret
      and left(n.cpv, 5) = left(m.cpv, 5)
      and n.date_notification > m.date_notification + interval '1 month'
      and n.date_notification >= m.date_fin_estimee - interval '18 months'
  ) as deja_relance_le
from marches m
where m.renouvelable
  and m.date_fin_estimee between current_date and current_date + interval '12 months';
