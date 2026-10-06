-- Données publiques : marchés attribués (DECP), acheteurs, titulaires, journal des imports.

create table acheteurs (
  siret       text primary key check (siret ~ '^\d{14}$'),
  nom         text,
  departement text,
  maj_le      timestamptz not null default now()
);

-- Un marché par couple (acheteur, identifiant) : le même identifiant peut être réutilisé par deux acheteurs.
create table marches (
  uid               text primary key,
  id_marche         text not null,
  acheteur_siret    text not null,
  objet             text,
  cpv               text,
  -- travaux (CPV 45), fournitures (CPV 03 à 44) ou services (le reste)
  famille           text not null check (famille in ('travaux', 'fournitures', 'services')),
  -- false pour les travaux et la maîtrise d'œuvre (CPV 45 et 71) : leur fin ne prédit pas de relance
  renouvelable      boolean not null,
  nature            text,
  procedure         text,
  montant           numeric,
  date_notification date not null,
  duree_mois        integer check (duree_mois between 1 and 120),
  date_fin_estimee  date,
  offres_recues     integer,
  departement       text,
  source            text,
  format            text not null check (format in ('2019', '2022'))
);

create index marches_fin_idx on marches (date_fin_estimee) where renouvelable;
create index marches_acheteur_idx on marches (acheteur_siret);
create index marches_cpv_idx on marches (cpv);
create index marches_departement_idx on marches (departement);

create table marches_titulaires (
  marche_uid       text not null references marches (uid) on delete cascade,
  titulaire_id     text not null,
  type_identifiant text,
  siren            text generated always as (
    case
      when type_identifiant = 'SIRET' and titulaire_id ~ '^\d{14}$' then left(titulaire_id, 9)
      -- certains acheteurs publient le SIREN (9 chiffres) à la place du SIRET
      when type_identifiant in ('SIRET', 'SIREN') and titulaire_id ~ '^\d{9}$' then titulaire_id
    end
  ) stored,
  primary key (marche_uid, titulaire_id)
);

create index marches_titulaires_siren_idx on marches_titulaires (siren);

create table imports (
  id        bigserial primary key,
  source    text not null,
  debut     timestamptz not null default now(),
  fin       timestamptz,
  lignes    integer,
  statut    text not null default 'en_cours' check (statut in ('en_cours', 'ok', 'erreur')),
  message   text
);

create index marches_acheteur_cpv_idx on marches (acheteur_siret, left(cpv, 5), date_notification);

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
