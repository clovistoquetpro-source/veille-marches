-- Connexion par adresse et mot de passe. Le mot de passe n'est jamais gardé : seulement son
-- empreinte PBKDF2 salée. Les comptes créés avant n'en ont pas : ils en choisissent un avec
-- « Mot de passe oublié ».

alter table comptes
  add column mot_de_passe     text,
  -- essais ratés d'affilée : au cinquième, la connexion est bloquée un quart d'heure
  add column echecs_connexion integer not null default 0,
  add column bloque_jusqu_au  timestamptz;

-- Liens « choisir un nouveau mot de passe » envoyés par courriel. On ne garde que l'empreinte
-- SHA-256 du jeton : quelqu'un qui lirait la base ne pourrait pas s'en servir.
create table reinitialisations (
  jeton_hash text primary key,
  compte_id  uuid not null references comptes (id) on delete cascade,
  cree_le    timestamptz not null default now(),
  expire_le  timestamptz not null
);

create index reinitialisations_compte_idx on reinitialisations (compte_id, cree_le);
