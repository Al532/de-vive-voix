# Bibliothèque en ligne de De vive voix

La bibliothèque conserve les partitions préparées, leurs MusicXML originaux quand ils sont disponibles et les sons de syllabes absents du catalogue commun. Les deux comptes autorisés voient les mêmes partitions et dossiers. Supprimer un dossier remet ses partitions dans « Sans dossier » pour les deux comptes.

## Première mise en ligne

1. Appliquer la migration `supabase/migrations/202611230001_library.sql` dans un projet Supabase dédié. Le stockage est privé. Désactiver les nouvelles inscriptions publiques, créer les comptes applicatifs dans Authentication avec leurs adresses confirmées et inscrire leurs identifiants dans `dvv_members`.
2. Définir un mot de passe distinct pour chaque compte avec l’API d’administration Supabase Auth. Les membres se connectent dans « Mes partitions » avec leur adresse e-mail et leur mot de passe. Conserver les mots de passe hors du dépôt.
3. Exécuter `node tools/cloud-library/seed.mjs` depuis la racine du dépôt avec `DVV_SUPABASE_URL` et `DVV_SUPABASE_SERVICE_KEY` dans l’environnement. Le script transfère et relit chaque fichier avant d’inscrire le catalogue. Ne jamais inscrire la clé de service dans Git, dans la configuration du site ou dans une page web.
4. Renseigner dans `dist/cloud-config.js` un objet `globalThis.DVV_CLOUD_CONFIG` avec `url`, `publicKey` (clé publiable) et `cutover: true`. Vérifier sur un serveur de test que les trois partitions fournies s’ouvrent, que les deux membres voient les mêmes imports et que les autres comptes n’y ont pas accès. Publier après ces essais. Le workflow retire les copies livrées dans le site à l’étape de publication. Le dépôt conserve les exemplaires nécessaires aux vérifications et au retour arrière.

## Sur les appareils

Ouvrir « Mes partitions » et se connecter sur chaque appareil. Sur l’appareil où des partitions locales existent, choisir « Copier les partitions locales en ligne ». Une partition est comptée comme copiée uniquement après lecture et vérification de sa copie distante et des fichiers audio associés. « Retirer les copies locales vérifiées » revérifie chaque copie en ligne juste avant le retrait. Une erreur ou une version différente conserve la copie locale. Les réglages de travail restent enregistrés sur l’appareil.

Les imports d’une autre adresse Web doivent être migrés depuis le navigateur et l’adresse qui les contiennent. Cette version accède aux imports de l’adresse GitHub Pages. Si un morceau n’existe que sur l’ancienne adresse Sites, conserver ou réimporter son MusicXML avant de retirer l’ancienne copie.
