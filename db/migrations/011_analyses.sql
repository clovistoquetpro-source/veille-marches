-- Analyse « on y va ou pas » d'un dossier de consultation par l'IA.

-- Pièces du dossier déposées par le client chez Anthropic (API Files), le temps de l'analyse.
-- On garde ici à qui appartient chaque fichier : un client ne peut faire analyser que les siens.
create table analyses_fichiers (
  fichier_id text primary key,
  compte_id  uuid not null references comptes (id) on delete cascade,
  nom        text not null,
  taille     bigint not null,
  depose_le  timestamptz not null default now()
);

create index analyses_fichiers_compte_idx on analyses_fichiers (compte_id, depose_le);

create table analyses (
  id           uuid primary key default gen_random_uuid(),
  compte_id    uuid not null references comptes (id) on delete cascade,
  -- l'avis n'est pas une clé étrangère : les avis anciens sont purgés, l'analyse reste
  avis_uid     text not null,
  fichiers     text[] not null,
  -- verdict, raisons, exigences… tels que l'IA les a rendus (voir src/lib/analyse.ts)
  resultat     jsonb not null,
  modele       text not null,
  -- consommation, pour suivre ce que coûte chaque analyse
  jetons_entree integer not null,
  jetons_sortie integer not null,
  cree_le      timestamptz not null default now()
);

-- le quota mensuel compte les analyses du mois par compte
create index analyses_compte_idx on analyses (compte_id, cree_le desc);
