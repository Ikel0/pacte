# Pacte: fiche de travail

## Le problème que j’explore

Les pipelines cassent rarement parce qu’un outil est mal choisi. Ils cassent souvent parce qu’une hypothèse implicite change : une colonne disparaît, une valeur métier arrive sous une autre forme, un lot est en retard ou un identifiant cesse d’être unique.

Pacte cherche à rendre cette hypothèse explicite avant qu’un lot entre dans une plateforme data.

## Question centrale

Comment donner à une équipe un mécanisme simple pour décider si un lot doit être accepté, revu ou mis en quarantaine, tout en expliquant les conséquences de cette décision ?

## Premier modèle

Un contrat décrit :

- le propriétaire et la version du jeu de données ;
- les champs attendus et leurs règles ;
- les valeurs métier acceptées ;
- les actifs qui dépendent de la source.

Le moteur produit une décision `accept`, `accept_with_warnings` ou `quarantine`. Chaque exécution est conservée avec le lot, la version du contrat, le score et le détail des contrôles.

## Compromis assumés

SQLite et les contrats JSON ne sont pas un choix de production universel. Ils permettent ici de rendre le comportement lisible et testable sans infrastructure. Dans un environnement de travail, je connecterais cette logique aux orchestrateurs, au catalogue, à l’alerting et à un stockage d’audit partagé.

## Prochaines questions

1. Comment gérer les évolutions compatibles de schéma au lieu de considérer toute nouvelle colonne comme un avertissement ?
2. Comment relier les contrôles à des SLA de fraîcheur réels ?
3. Comment présenter l’impact à une personne métier qui ne connaît pas le lineage technique ?
4. Quelle part de la validation doit bloquer automatiquement, et quelle part doit rester une décision humaine ?

## Critère de réussite

Le projet sera utile s’il réduit le temps nécessaire pour comprendre une anomalie, justifie clairement une décision d’ingestion et permet de savoir qui doit être prévenu quand une source est dégradée.
