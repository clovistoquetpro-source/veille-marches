-- Avis publiés (BOAMP pour les avis nationaux, TED pour les avis européens) et entreprises (Sirene).

create table avis (
  uid              text primary key,          -- source + numéro : « boamp-26-94446 », « ted-677877-2026 »
  source           text not null check (source in ('boamp', 'ted')),
  numero           text not null,
  type             text not null check (type in (
                     'marche', 'attribution', 'preinformation', 'rectificatif', 'annulation', 'modification', 'autre')),
  objet            text not null,
  acheteur_nom     text,
  acheteur_siret   text check (acheteur_siret ~ '^\d{14}$'),
  cpv              text,                      -- code CPV principal, absent des avis MAPA du BOAMP
  famille          text check (famille in ('travaux', 'fournitures', 'services')),
  descripteurs     text[],                    -- mots-clés du BOAMP (« Assurance », « Nettoyage »…)
  departements     text[] not null default '{}',
  date_publication date not null,
  date_limite      date,                      -- date limite de réponse (heure de Paris)
  montant          numeric,
  offres_recues    integer,
  url              text not null,
  avis_initial     text,                      -- numéro de l'avis de marché auquel répond une attribution
  maj_le           timestamptz not null default now()
);

create index avis_publication_idx on avis (date_publication desc);
create index avis_acheteur_idx on avis (acheteur_siret);
create index avis_departements_idx on avis using gin (departements);
create index avis_cpv_idx on avis (cpv);

create table avis_titulaires (
  avis_uid    text not null references avis (uid) on delete cascade,
  rang        integer not null,
  nom         text,
  identifiant text,
  siren       text generated always as (
    case when identifiant ~ '^\d{9}(\d{5})?$' then left(identifiant, 9) end
  ) stored,
  primary key (avis_uid, rang)
);

create index avis_titulaires_siren_idx on avis_titulaires (siren);

-- Unités légales Sirene des titulaires et des acheteurs. `nom` est vide pour les entrepreneurs
-- individuels qui ont refusé la diffusion de leurs données.
create table entreprises (
  siren               text primary key check (siren ~ '^\d{9}$'),
  nom                 text,
  sigle               text,
  categorie_juridique text,
  naf                 text,
  tranche_effectif    text,
  categorie           text,                   -- PME, ETI ou GE
  date_creation       date,
  active              boolean not null,
  diffusible          boolean not null,
  maj_le              timestamptz not null default now()
);
