# veille-marches

Veille des marchés publics : alertes sur les nouveaux avis (BOAMP, TED) et sur les renouvellements de marchés 6 à 12 mois avant leur relance (DECP).

Architecture et calendrier : [document d'architecture](https://claude.ai/code/artifact/4d006c98-692f-4d39-b4a4-12d792ec5824).

## Organisation du code

| Dossier | Contenu |
| --- | --- |
| `src/app` | Site Next.js (pages publiques et espace client) |
| `src/lib` | Accès à la base et requêtes métier (renouvellements, fiches, profils de veille…) |
| `src/ingest` | Nettoyage et chargement des données publiques |
| `scripts` | Commandes lancées à la main ou par les tâches planifiées |
| `db/migrations` | Schéma de la base, appliqué dans l'ordre des fichiers |
| `.github/workflows` | Tests automatiques et imports planifiés |

## Commandes

```bash
npm install
npm run dev            # site en local sur http://localhost:3000
npm test               # tests (ajouter DATABASE_URL_TEST pour les tests sur une vraie base locale)
npm run lint && npm run typecheck
npm run db:migrer      # applique les migrations sur DATABASE_URL
npm run import:decp    # télécharge les DECP et remplace les marchés en base (5 à 10 minutes)
npm run import:sirene  # noms et activités des entreprises et acheteurs (fichier Sirene, 1 à 2 minutes)
npm run import:avis    # avis BOAMP et TED depuis le dernier import (ou -- --depuis AAAA-MM-JJ)
npm run preview        # site tel qu'il tournera sur Cloudflare
npm run deploy         # mise en ligne sur Cloudflare
```

Variables : voir `.env.example`.

## Inscription et profil de veille

Le client ne donne que son SIRET. On demande son nom et son activité à l'[annuaire des
entreprises](https://recherche-entreprises.api.gouv.fr) (API publique, sans clé), puis on lui propose
un profil de veille :

1. les classes CPV et les départements de ses marchés déjà gagnés, dès qu'il en a au moins trois ;
2. sinon une déduction de l'IA à partir de son activité déclarée (clé `ANTHROPIC_API_KEY`) ;
3. sinon les mots significatifs de cette activité.

Le profil est modifiable sur `/veille` : préfixes CPV, mots-clés cherchés dans l'objet des avis, et
départements (vide = toute la France). Un avis correspond quand son code CPV commence par l'un des
préfixes **ou** que son objet contient l'un des mots-clés, et qu'il s'exécute dans l'un des
départements suivis. Les mêmes règles serviront aux alertes par courriel.

La session est un identifiant tiré au sort, déposé dans un cookie et conservé un mois en base.

## Données

- **DECP** : exports parquet de [data.economie.gouv.fr](https://data.economie.gouv.fr), jeux `decp-v3-marches-valides` (2018-2023) et `decp-2022-marches-valides` (2023 à aujourd'hui). Import complet chaque lundi, suivi de Sirene.
- **BOAMP** : avis nationaux (MAPA, procédures formalisées) par l'API Opendatasoft de la DILA, chaque matin. Les avis européens repris par le BOAMP (famille « JOUE ») sont tous sur TED : on les prend là-bas.
- **TED** : avis européens des acheteurs français par l'API de recherche v3, chaque matin. Les avis de modification sont classés en rectificatifs.
- **Sirene** : fichier mensuel des unités légales (parquet sur data.gouv.fr), limité aux SIREN présents en base. Le nom des entrepreneurs individuels qui refusent la diffusion n'est pas repris.
- Date de fin estimée = date de notification + durée publiée (reconductions comprises).
- Les travaux (CPV 45) et la maîtrise d'œuvre (CPV 71) ne sont pas proposés comme renouvellements : leur fin ne prédit pas de relance (mesure du 5 octobre 2026).
- Les montants de remplissage (9 999 999 €, 99 999 999 €…) sont ignorés ; les totaux des fiches excluent les montants supérieurs à un milliard d'euros.
- Les titulaires des avis BOAMP nationaux sont lus dans un texte libre : le nom est retrouvé dans environ 85 % des attributions, le SIRET rarement (mesure sur une semaine d'octobre 2026). TED donne le SIREN ou le SIRET dans environ 4 attributions sur 10.

Sources sous Licence Ouverte : DECP (ministère de l'Économie), BOAMP (DILA), TED (Office des publications de l'UE).
