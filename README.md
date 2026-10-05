# veille-marches

Veille des marchés publics : alertes sur les nouveaux avis (BOAMP, TED) et sur les renouvellements de marchés 6 à 12 mois avant leur relance (DECP).

Architecture et calendrier : [document d'architecture](https://claude.ai/code/artifact/4d006c98-692f-4d39-b4a4-12d792ec5824).

## Organisation du code

| Dossier | Contenu |
| --- | --- |
| `src/app` | Site Next.js (pages publiques et espace client) |
| `src/lib` | Accès à la base et requêtes métier (renouvellements…) |
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
npm run preview        # site tel qu'il tournera sur Cloudflare
npm run deploy         # mise en ligne sur Cloudflare
```

Variables : voir `.env.example`.

## Données

- **DECP** : exports parquet de [data.economie.gouv.fr](https://data.economie.gouv.fr), jeux `decp-v3-marches-valides` (2018-2023) et `decp-2022-marches-valides` (2023 à aujourd'hui). Import complet chaque lundi.
- Date de fin estimée = date de notification + durée publiée (reconductions comprises).
- Les travaux (CPV 45) et la maîtrise d'œuvre (CPV 71) ne sont pas proposés comme renouvellements : leur fin ne prédit pas de relance (mesure du 5 octobre 2026).

Sources sous Licence Ouverte : DECP (ministère de l'Économie), BOAMP (DILA), TED (Office des publications de l'UE).
