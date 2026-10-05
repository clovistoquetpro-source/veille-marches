-- Abonnements Stripe. Un compte a au plus un abonnement ; l'essai gratuit commence à l'inscription.

create table abonnements (
  compte_id        uuid primary key references comptes (id) on delete cascade,
  statut           text not null check (statut in ('essai', 'actif', 'en_retard', 'resilie')),
  fin_essai        date,
  -- identifiants Stripe (customer, subscription) ; nuls tant que le client n'a pas payé
  client_stripe    text unique,
  abonnement_stripe text unique,
  fin_periode      timestamptz,
  maj_le           timestamptz not null default now()
);

-- Tout compte créé avant cette migration garde son accès : on leur ouvre un essai.
insert into abonnements (compte_id, statut, fin_essai)
select id, 'essai', (cree_le + interval '14 days')::date from comptes
on conflict do nothing;
