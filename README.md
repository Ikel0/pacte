# Pacte

Pacte est une démo de contrôle de lots CSV avant ingestion. Elle part d’un cas précis : un export quotidien de commandes peut changer sans prévenir, alors que des tableaux et traitements attendent encore l’ancien format.

Le périmètre est volontairement petit. Pour un fichier et un contrat versionné, Pacte calcule une décision reproductible (admettre, demander une revue ou écarter le lot) et l’enregistre dans un reçu local.

Démo en ligne : https://pacte-ikel.onrender.com (instance gratuite Render, le premier chargement peut prendre une minute).

![Résultat du contrôle de l’export aux valeurs invalides](docs/demo.png)

La capture montre l’état d’ouverture de la page : le procès-verbal du lot aux valeurs invalides, avec la décision (lot refusé, en quarantaine) et son motif d’abord, puis les lignes du fichier et, en marge de chaque ligne fautive, l’écart relevé.

## Les scénarios fournis

Trois exports de commandes synthétiques sont inclus dans `data/`. Le fichier conforme passe. Celui qui contient une date invalide, un montant négatif, un client manquant, un statut inconnu et une clé en double est écarté. Celui qui ajoute une colonne `currency` attend une revue avant toute publication.

## Corriger le lot dans la page

Les valeurs du tableau « Lignes contrôlées » se modifient sur place. On peut aussi ajouter ou retirer une ligne, retirer une colonne absente du contrat ou coller un petit CSV. À chaque modification, la page renvoie la copie entière à `POST /api/trial`, qui applique exactement les mêmes contrôles que pour un fichier du dépôt ; la décision, le motif et la colonne des écarts se mettent à jour. La page indique alors « Scénario modifié par vous », et « Revenir au lot de référence » (ou « Réinitialiser ») rétablit le fichier d’origine.

Les règles restent celles du contrat : corriger seulement la date et le montant de la ligne 3 laisse le lot refusé, car ord-1001 reste en double et la ligne 4 garde un client manquant et un statut inconnu. Le lot passe à « accepté » une fois les cinq écarts corrigés, ou les deux lignes retirées.

L’essai est calculé en mémoire : rien n’est écrit, ni le contenu ni un reçu, et un visiteur ne voit jamais la copie d’un autre puisque chaque appel transporte son propre lot. Un essai est limité à 200 lignes et 64 Ko, et à 90 appels par minute et par adresse IP. Les valeurs saisies sont réaffichées comme du texte (jamais comme du HTML), et une formule comme `=1+1` reste une chaîne invalide pour un montant.

## Ce qui est réellement contrôlé

- en-têtes manquants, dupliqués ou inattendus ;
- lignes vides ou valeurs sans en-tête ;
- champs obligatoires, types, bornes et valeurs autorisées ;
- unicité de la clé métier ;
- présence de lignes dans le lot ;
- empreinte SHA-256 du fichier brut et du contrat évalué ;
- reçu local idempotent : rejouer exactement le même fichier avec le même contrat retrouve le même run.

Les conséquences affichées viennent de la liste de consommateurs déclarée dans le contrat. Elles ne constituent pas une découverte automatique de dépendances.

## Les trois décisions

```text
accept      le lot respecte le contrat, la démo autoriserait la publication
review      un écart non bloquant doit être compris par le propriétaire avant publication
quarantine  un contrôle bloquant échoue, le lot est maintenu à l’écart
```

Le prototype calcule et enregistre cette décision. Il n’écrit pas dans une table métier, n’arrête pas de job et n’envoie pas d’alerte externe.

## Lancer localement

```bash
cd pacte
PYTHONPATH=src python3 -m pacte.server
```

Ouvrir ensuite `http://localhost:8090` : la page s’ouvre sur le procès-verbal du lot refusé. On peut choisir un autre export et relancer les contrôles. La page affiche le procès-verbal (décision, lignes en écart, contrôles, suite pour les consommateurs, reçu), puis le contrat lui-même. `http://localhost:8090/?lot=orders_schema_drift.csv` lance directement le contrôle d’un lot.

## Vérifier le projet

```bash
PYTHONPATH=src python3 -m unittest discover -s tests -v
node --test tests/*.test.js
```

La suite Python couvre le lot conforme, la dérive de schéma, les erreurs de qualité, un lot vide, un contrat invalide, l’idempotence du reçu et l’endpoint d’essai (chaque correction proposée par la page, isolation entre visiteurs, absence d’écriture, limites de taille et de débit, valeurs contenant du HTML ou une formule). Le test Node vérifie la reconstruction du CSV dans la page et l’absence d’injection de HTML.

## API de démonstration

- `GET /api/health` expose la version et l’empreinte du contrat chargé.
- `GET /api/overview` retourne le contrat, les lots fournis et les derniers reçus locaux.
- `GET /api/audit` retourne l’historique compact des exécutions.
- `GET /api/runs/{run_id}` retrouve une exécution précise.
- `POST /api/validate` avec `{ "batch": "orders_clean.csv" }` lance les contrôles sur un lot inclus dans `data/` et enregistre un reçu.
- `POST /api/trial` avec `{ "csv": "order_id,…\n…" }` contrôle un CSV envoyé, en mémoire et sans reçu (200 lignes, 64 Ko, 90 appels par minute et par IP).

## Limites assumées

Le SLA de fraîcheur est déclaré dans le contrat, mais non mesuré : les CSV de démonstration ne contiennent pas d’horodatage de livraison fiable. SQLite est suffisant pour inspecter le comportement localement, pas pour conserver un audit d’équipe durable. Une évolution réaliste demanderait un manifeste de livraison, une revue avec auteur et raison, un stockage partagé et une stratégie d’alerte.

La [fiche de travail](docs/working-paper.md) décrit les compromis et les prochaines questions.
