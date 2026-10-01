# Pacte: fiche de travail

## Le problème que j’explore

Les pipelines ne cassent pas uniquement lorsqu'un outil tombe. Ils cassent aussi lorsqu'une hypothèse implicite change : une colonne disparaît, une valeur métier arrive sous une autre forme, un lot est vide ou un identifiant cesse d'être unique. Le tableau aval peut alors sembler crédible alors qu'il repose déjà sur une entrée dégradée.

Pacte cherche à rendre l'hypothèse explicite avant qu'un lot entre dans une plateforme data : qui fournit quoi, sous quelle version, quels contrôles sont non négociables et qui est touché si le lot est refusé.

## Question centrale

Comment donner à une équipe un mécanisme simple pour accepter, faire revoir ou mettre en quarantaine un lot, tout en produisant une décision qu'elle peut expliquer et reproduire ?

## Le modèle de décision

Un contrat décrit :

- le propriétaire, la version et la durée de fraîcheur attendue ;
- les champs attendus, leur type et leurs règles métier ;
- les clés qui doivent rester uniques ;
- les actifs aval et leur niveau de criticité.

Le moteur compose ensuite quatre éléments :

```text
contrat versionné
    + fichier exact
    + contrôles déterministes
    = décision d'admission + impact + reçu d'audit
```

La décision n'est pas qu'une étiquette visuelle. `accept` autorise une publication, `accept_with_warnings` demande une revue avant publication et `quarantine` ferme la porte aux consommateurs critiques et à fort impact. Dans l'application de démonstration, ce plan d'impact est calculé et audité. Il ne lance volontairement aucune écriture ou suspension de job réel.

## Pourquoi les reçus comptent

Un journal qui dit seulement « le lot a échoué » est insuffisant pour diagnostiquer une dérive. Pacte attache au résultat :

- l'empreinte SHA-256 du fichier lu ;
- l'empreinte canonique du contrat évalué ;
- un identifiant de run déterministe pour ce couple fichier-contrat ;
- le détail des contrôles, de leur sévérité et du nombre de lignes touchées ;
- la décision et le plan pour les consommateurs déclarés.

Une nouvelle validation du même fichier sous le même contrat rejoue le reçu au lieu de multiplier les entrées d'audit. Si l'un des deux change, un nouveau run est créé. C'est un petit choix technique, mais il permet d'éviter de confondre une nouvelle exécution avec une nouvelle donnée.

## Protocole de vérification

La suite locale couvre les comportements qui seraient coûteux à découvrir dans un pipeline :

- un lot propre est accepté ;
- une colonne additionnelle déclenche une revue explicite ;
- une violation de type, de clé ou de valeur bloque le lot ;
- un fichier vide, une ligne qui dépasse le schéma ou un contrat mal formé échouent avant publication ;
- un reçu est idempotent pour une entrée identique.

Les contrôles sont séparés par famille : schéma, validité des champs, clés métier et volume. Cette séparation est plus utile qu'un score seul lorsque l'équipe doit choisir la bonne action.

## Compromis assumés

SQLite et les contrats JSON ne constituent pas une plateforme de gouvernance complète. Ils servent ici à garder le chemin d'exécution inspectable et les tests rapides, sans dissimuler la logique derrière une infrastructure opaque. Dans un environnement d'équipe, je relierais le même format de décision à un orchestrateur, un catalogue, un stockage d'audit partagé et à l'alerting du propriétaire.

La fraîcheur est déclarée dans le contrat mais pas encore vérifiée contre un horodatage de livraison fiable. Le CSV de démonstration ne contient pas ce signal opérationnel. Plutôt que de produire une mesure fictive, l'application limite sa décision aux contrôles qu'elle peut prouver.

## Prochaines questions

1. Comment versionner proprement les évolutions compatibles de schéma et leur période de dépréciation ?
2. Comment transmettre un événement de réception avec un horodatage de source vérifiable pour contrôler la fraîcheur ?
3. Comment diffuser le plan d'impact à une personne métier sans lui demander de connaître le lineage technique ?
4. Comment signer ou externaliser les reçus d'audit lorsqu'ils deviennent des objets de conformité ?

## Critère de réussite

Le projet sera utile s'il réduit le temps nécessaire pour comprendre une anomalie, justifie une décision d'ingestion sans recourir à la mémoire de l'équipe et indique clairement qui doit être prévenu quand une source devient non fiable.
