-- Alertes par courriel : rythme choisi par le client, jeton de désinscription, journal des envois.

-- Jeton tiré au sort par le site, mis dans le lien de désinscription de chaque courriel.
alter table comptes add column jeton text unique;

alter table profils add column frequence text not null default 'quotidienne'
  check (frequence in ('quotidienne', 'hebdomadaire', 'aucune'));

create table alertes (
  id                 bigserial primary key,
  compte_id          uuid not null references comptes (id) on delete cascade,
  envoye_le          timestamptz not null default now(),
  nb_avis            integer not null,
  nb_renouvellements integer not null,
  statut             text not null check (statut in ('envoyee', 'erreur')),
  message            text
);

create index alertes_compte_idx on alertes (compte_id, envoye_le desc);

-- Ce qui a déjà été annoncé à ce client : on ne répète jamais un avis ni un marché.
create table alertes_avis (
  compte_id uuid not null references comptes (id) on delete cascade,
  avis_uid  text not null references avis (uid) on delete cascade,
  envoye_le timestamptz not null default now(),
  primary key (compte_id, avis_uid)
);

-- Pas de clé étrangère vers `marches` : l'import hebdomadaire des DECP remplace tous les marchés,
-- et un identifiant peut disparaître d'une semaine à l'autre.
create table alertes_marches (
  compte_id   uuid not null references comptes (id) on delete cascade,
  marche_uid  text not null,
  envoye_le   timestamptz not null default now(),
  primary key (compte_id, marche_uid)
);
