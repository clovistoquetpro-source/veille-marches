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
npm run import:decp    # télécharge les DECP et met à jour les marchés qui ont changé (5 à 10 minutes)
npm run import:sirene  # noms et activités des entreprises et acheteurs (fichier Sirene, 1 à 2 minutes)
npm run import:avis    # avis BOAMP et TED depuis le dernier import (ou -- --depuis AAAA-MM-JJ)
npm run alertes        # alertes par courriel (-- --essai pour les afficher sans les envoyer)
npm run preview        # site tel qu'il tournera sur Cloudflare
npm run deploy         # mise en ligne sur Cloudflare
```

Variables : voir `.env.example`.

## Inscription et profil de veille

Le client crée son compte sur `/connexion?mode=creer` avec son SIRET, son adresse et un mot de passe.
On demande son nom et son activité à l'[annuaire des
entreprises](https://recherche-entreprises.api.gouv.fr) (API publique, sans clé), puis on lui propose
un profil de veille :

1. les classes CPV et les départements de ses marchés déjà gagnés, dès qu'il en a au moins trois ;
2. sinon une déduction de l'IA à partir de son activité déclarée (clé `ANTHROPIC_API_KEY`) ;
3. sinon les mots significatifs de cette activité.

Le profil est modifiable sur `/veille` : préfixes CPV, mots-clés cherchés dans l'objet des avis, et
départements (vide = toute la France). Un avis correspond quand son code CPV commence par l'un des
préfixes **ou** que son objet contient l'un des mots-clés, et qu'il s'exécute dans l'un des
départements suivis. Les mêmes règles serviront aux alertes par courriel.

Il se connecte ensuite sur `/connexion` avec son adresse et son mot de passe. On ne garde que l'empreinte
PBKDF2 salée du mot de passe (100 000 itérations, le plafond de Cloudflare Workers) ; au cinquième essai
raté d'affilée, la connexion est bloquée un quart d'heure. « Mot de passe oublié » envoie par Brevo un
lien valable une heure, qui ne sert qu'une fois et ferme les autres sessions. Une adresse déjà inscrite
ne peut pas recréer de compte : les comptes créés avant les mots de passe en choisissent un par ce lien.

La session est un identifiant tiré au sort, déposé dans un cookie et conservé un mois en base.

## Alertes

Chaque matin (ou le lundi, au choix du client), un courriel reprend les appels d'offres parus depuis
la dernière alerte, les marchés qui entrent dans la fenêtre de relance, 6 à 12 mois avant leur fin, et
les marchés que ses concurrents suivis viennent de gagner.
Rien n'est annoncé deux fois : les avis et les marchés envoyés sont retenus par compte. Les lots d'un
même marché sont regroupés en une ligne, et un acheteur ne prend jamais plus de trois lignes.

L'envoi passe par [Brevo](https://brevo.com) (secret `BREVO_API_KEY`) ; sans clé, les courriels sont
affichés dans la console. Chaque courriel porte un lien de désinscription qui coupe les alertes sans
supprimer le compte.

## Veille des concurrents

Le client suit jusqu'à 20 entreprises, depuis leur fiche, depuis `/veille` (par leur nom, leur SIREN ou
leur SIRET), ou parmi les concurrents qu'on lui propose : celles qui gagnent le plus souvent les marchés
de son profil depuis deux ans. Pour chacune, `/veille` montre ses marchés gagnés dans l'année, ceux qui
arrivent à échéance (qu'on peut lui reprendre) et ses derniers gains.

Un gain vient d'un avis d'attribution (BOAMP, TED) des 30 derniers jours, ou des DECP des 90 derniers
jours (elles paraissent avec retard). Les avis du BOAMP donnent rarement le SIRET du titulaire : on
les rapproche alors par le nom, débarrassé de sa forme juridique et de ses accents
(`nom_simplifie`, 64 % des titulaires sans SIRET retrouvés). Un marché déjà connu par son avis
d'attribution n'est pas annoncé une seconde fois quand il arrive dans les DECP.

## Abonnement

Essai gratuit de 14 jours à l'inscription, sans carte. Ensuite l'abonnement passe par Stripe
(`STRIPE_SECRET_KEY`, `STRIPE_PRIX`, et `STRIPE_WEBHOOK_SECRET` pour le point d'entrée
`/api/stripe`). Sans ces variables, le site reste utilisable : le paiement est simplement masqué.
Les alertes ne partent qu'aux comptes dont l'accès est ouvert (abonnement en cours ou essai non échu).

## Mise en ligne

Le site tourne sur Cloudflare Workers et la base sur Supabase. Chaque fusion dans `main` dont la CI
passe est déployée par le workflow `deploiement.yml` : il met la base à jour (`db:migrer`) puis lance
`npm run deploy`. Il est sauté tant que les secrets Cloudflare manquent, et se relance à la main depuis
l'onglet *Actions*.

1. Créer le projet Supabase (région UE, offre gratuite), récupérer la chaîne de connexion en mode *Transaction*.
2. `DATABASE_URL=… npm run db:migrer`, puis les imports (`import:decp`, `import:sirene`, `import:avis`).
3. Dans GitHub, *Settings > Secrets and variables > Actions* : secrets `DATABASE_URL`, `BREVO_API_KEY`,
   `CLOUDFLARE_API_TOKEN` (jeton créé avec le modèle *Edit Cloudflare Workers*) et `CLOUDFLARE_ACCOUNT_ID` ;
   variables `SITE_URL`, `COURRIEL_ADRESSE`. Sans eux, les imports, les alertes et le déploiement sont sautés.
4. Les secrets du site (`DATABASE_URL`, `ANTHROPIC_API_KEY`, `BREVO_API_KEY`, `STRIPE_SECRET_KEY`,
   `STRIPE_PRIX`, `STRIPE_WEBHOOK_SECRET`) se saisissent aussi dans GitHub : chaque déploiement les copie
   dans le Worker (`wrangler secret bulk`), avec la variable `COURRIEL_ADRESSE`, expéditeur des courriels
   « mot de passe oublié ». Les variables `SITE_URL` et `EDITEUR_*` se saisissent dans le
   tableau de bord du Worker (*Settings > Variables*) et sont conservées à chaque déploiement (`keep_vars`).
   L'offre gratuite de Workers ne suffit pas : elle coupe chaque requête après 10 ms de calcul, et les
   pages avec des données en demandent une vingtaine. Il faut l'offre Workers Paid (5 $ par mois).
5. Dans Stripe, déclarer le point d'entrée `https://…/api/stripe` pour les événements
   `checkout.session.completed`, `customer.subscription.*` et `invoice.payment_failed`.

**Avant d'encaisser le premier paiement** : renseigner les variables `EDITEUR_*` (les mentions légales
et les conditions affichent sinon un avertissement) et faire relire les conditions de vente.

## Données

- **DECP** : exports parquet de [data.economie.gouv.fr](https://data.economie.gouv.fr), jeux `decp-v3-marches-valides` (2018-2023) et `decp-2022-marches-valides` (2023 à aujourd'hui). Import chaque lundi, suivi de Sirene : tout est nettoyé dans DuckDB, puis seuls les marchés nouveaux, modifiés ou disparus sont écrits en base (une empreinte du contenu sert à comparer).
- **BOAMP** : avis nationaux (MAPA, procédures formalisées) par l'API Opendatasoft de la DILA, chaque matin. Les avis européens repris par le BOAMP (famille « JOUE ») sont tous sur TED : on les prend là-bas.
- **TED** : avis européens des acheteurs français par l'API de recherche v3, chaque matin. Les avis de modification sont classés en rectificatifs.
- **Sirene** : fichier mensuel des unités légales (parquet sur data.gouv.fr), limité aux SIREN présents en base. Le nom des entrepreneurs individuels qui refusent la diffusion n'est pas repris.
- Un même marché transmis par deux sources (la DGFIP et la plateforme de l'acheteur) n'est gardé qu'une fois : même acheteur, même date, même montant et mêmes titulaires, sous deux identifiants et deux objets différents. On garde la plateforme, dont l'objet est plus lisible. Cela écarte 20 139 doublons sur 1,15 million de marchés (mesure du 6 octobre 2026).
- Date de fin estimée = date de notification + durée publiée (reconductions comprises).
- Les travaux (CPV 45) et la maîtrise d'œuvre (CPV 71) ne sont pas proposés comme renouvellements : leur fin ne prédit pas de relance (mesure du 5 octobre 2026).
- Les montants de remplissage (9 999 999 €, 99 999 999 €…) sont ignorés ; les totaux des fiches excluent les montants supérieurs à un milliard d'euros.
- Les titulaires des avis BOAMP nationaux sont lus dans un texte libre : le nom est retrouvé dans environ 85 % des attributions, le SIRET rarement (mesure sur une semaine d'octobre 2026). TED donne le SIREN ou le SIRET dans environ 4 attributions sur 10.

### Taille de la base

La base doit tenir dans les 500 Mo de l'offre gratuite de Supabase, qui passe en lecture seule au-delà.
On garde donc les marchés notifiés depuis trois ans et ceux encore en cours (`ANNEES_HISTORIQUE`), et
les avis des six derniers mois ou dont la date limite n'est pas passée (`MOIS_AVIS`). Les colonnes que
le site n'affiche pas (identifiant, nature, procédure, source) restent dans le nettoyage DuckDB. Mesure
du 6 octobre 2026 en local : 577 000 marchés, 316 Mo en tout (773 Mo avec tout l'historique depuis 2018).

L'import n'écrit que ce qui change, pour ne jamais doubler la taille de la base pendant le chargement.
Si plus d'un marché sur cinq change (nouvelle règle de nettoyage), il supprime d'abord, fait le ménage
(`vacuum`), puis ajoute. Un projet gratuit est mis en pause après une semaine sans activité : les imports
quotidiens des avis suffisent à l'éviter.

Sources sous Licence Ouverte : DECP (ministère de l'Économie), BOAMP (DILA), TED (Office des publications de l'UE).
