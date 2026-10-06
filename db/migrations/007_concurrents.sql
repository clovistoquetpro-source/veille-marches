-- Veille des concurrents : le client suit des entreprises, on le prévient quand elles gagnent un marché.

-- Nom ramené à sa forme la plus simple, pour rapprocher les titulaires des avis du BOAMP (publiés le
-- plus souvent sans SIRET) des entreprises de la base Sirene : « Sas Dupont & Fils » et
-- « DUPONT ET FILS » donnent tous deux « DUPONT ET FILS ».
create function nom_simplifie(nom text) returns text
language sql immutable parallel safe as $$
  select nullif(btrim(regexp_replace(regexp_replace(regexp_replace(
    upper(translate(replace(replace(replace(replace(nom, '.', ''), '&', ' et '), 'œ', 'oe'), 'Œ', 'OE'),
      'àâäáãçéèêëíîïñóôöõúùûüýÿÀÂÄÁÃÇÉÈÊËÍÎÏÑÓÔÖÕÚÙÛÜÝŸ',
      'aaaaaceeeeiiinoooouuuuyyAAAAACEEEEIIINOOOOUUUUYY')),
    '[^A-Z0-9]+', ' ', 'g'),
    -- formes juridiques et mots qui ne distinguent pas une entreprise d'une autre
    '\m(SAS|SASU|SARL|EURL|SA|SNC|SCOP|SCIC|SELARL|SELAS|GIE|SEM|SPL|STE|SOCIETE|ETS|ETABLISSEMENTS)\M', ' ', 'g'),
    ' +', ' ', 'g')), '')
$$;

create index avis_titulaires_nom_idx on avis_titulaires (nom_simplifie(nom)) where siren is null;

-- Entreprises suivies par chaque client. `nom` est relevé au moment du suivi, pour les entreprises
-- qui ne sont pas encore dans notre base Sirene.
create table concurrents (
  compte_id uuid not null references comptes (id) on delete cascade,
  siren     text not null check (siren ~ '^\d{9}$'),
  nom       text,
  ajoute_le timestamptz not null default now(),
  primary key (compte_id, siren)
);

create index concurrents_siren_idx on concurrents (siren);

-- Marchés gagnés par un concurrent et déjà annoncés à ce client, ou déjà connus quand il a commencé
-- à suivre l'entreprise, qu'on les ait appris par un avis d'attribution (`avis`) ou par les DECP
-- (`marche`). Pas de clé étrangère, comme `alertes_marches`.
create table alertes_gains (
  compte_id uuid not null references comptes (id) on delete cascade,
  source    text not null check (source in ('avis', 'marche')),
  uid       text not null,
  envoye_le timestamptz not null default now(),
  primary key (compte_id, source, uid)
);

alter table alertes add column nb_gains integer not null default 0;
