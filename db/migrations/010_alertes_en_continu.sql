-- Alertes « dès qu'une offre sort » : le BOAMP publie tout au long de la journée, on prévient ces
-- clients après chaque import (toutes les 2 h en journée) au lieu d'attendre le lendemain matin.
alter table profils drop constraint profils_frequence_check;
alter table profils add constraint profils_frequence_check
  check (frequence in ('en_continu', 'quotidienne', 'hebdomadaire', 'aucune'));
