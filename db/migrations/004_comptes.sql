-- Comptes clients, profil de veille et sessions.

create table comptes (
  id         uuid primary key default gen_random_uuid(),
  -- l'adresse est comparée en minuscules : un seul compte par adresse
  email      text not null unique check (email = lower(email) and email like '%_@_%.__%'),
  siren      text check (siren ~ '^\d{9}$'),
  siret      text check (siret ~ '^\d{14}$'),
  nom        text,
  cree_le    timestamptz not null default now()
);

-- Ce que le client veut suivre. Les codes CPV sont des préfixes : « 90 » (tout l'environnement),
-- « 90910 » (nettoyage), « 90911300 » (nettoyage de vitres).
create table profils (
  compte_id    uuid primary key references comptes (id) on delete cascade,
  cpv          text[] not null default '{}' check (array_position(cpv, null) is null),
  mots_cles    text[] not null default '{}' check (array_position(mots_cles, null) is null),
  departements text[] not null default '{}' check (array_position(departements, null) is null),
  -- d'où vient la proposition initiale : marchés déjà gagnés, déduction par l'IA, ou saisie à la main
  origine      text not null check (origine in ('historique', 'ia', 'manuel')),
  maj_le       timestamptz not null default now()
);

-- Sessions : l'identifiant est tiré au sort et déposé dans un cookie, rien n'est signé côté site.
create table sessions (
  id        text primary key,
  compte_id uuid not null references comptes (id) on delete cascade,
  cree_le   timestamptz not null default now(),
  expire_le timestamptz not null
);

create index sessions_compte_idx on sessions (compte_id);
