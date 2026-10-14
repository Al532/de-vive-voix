# De vive voix

Atelier accessible pour travailler une voix et ses paroles à partir de partitions MusicXML.

Le texte du bloc apparaît après « Recommencer au début », avant les boutons de bloc. Il est visuel et exclu du parcours du lecteur d’écran ; sa lecture audio reste déclenchée par « Jouer le bloc ». Le repère indique la plage de mesures et le nombre total de mesures du morceau.

Le lecteur propose le travail par blocs, avec lecture naturelle du texte puis syllabes synchronisées à la musique, et la lecture du morceau entier. Au repos, deux boutons permettent de choisir le mode. Les déplacements par bloc ou par mesure apparaissent dans le mode correspondant. Le bouton du morceau entier devient Pause puis Reprendre ; Arrêter et la fin du morceau ramènent au repos.

## Organisation

- dist/ : site statique prêt à servir, catalogue audio et moteur vocal local compris.
- dist/scores/ : morceaux fournis avec le site, dont Exaudi nos de Jean Gilles (16 mesures, 7 parties, 5 voix avec paroles), fichier MusicXML original et préparation audio.
- check.cjs, check-import.cjs, check-phonetics.cjs : vérifications du lecteur et de l’import.
- tests/ et tools/testing/ : données et dépendances de test.
- tools/catalogue/ et scripts Python : génération du catalogue et préparation du pilote.

Le latin ecclésiastique des nouveaux imports et du morceau Exaudi nos utilise le phonème eSpeak `R` (r roulé). Les six syllabes concernées d’Exaudi nos ont été régénérées ; le lecteur utilise leurs fichiers à 175 mots/minute. Les anciens imports personnels sont préparés de nouveau lors de leur ouverture pour bénéficier de cette conversion.

Les audios sont versionnés dans Git et conservés sans régénération à chaque mise à jour. Le premier envoi comprend tous les fichiers ; les envois suivants depuis le PC ne transfèrent que les objets Git nouveaux ou modifiés. GitHub reconstruit ensuite le site sur ses serveurs.

## Essayer localement

Depuis la racine du dépôt :

    python -m http.server 8766 --directory dist

Ouvrir http://localhost:8766/ . Aucun service applicatif ni clé d’API n’est nécessaire. L’import et la préparation vocale des partitions s’exécutent sur l’appareil.

## Vérifier

Avec Node.js 24 :

    node check.cjs
    node check-bundled.cjs
    node check-import.cjs
    node check-phonetics.cjs
    node check-local-text.mjs

## Hébergement GitHub Pages

Le workflow .github/workflows/pages.yml vérifie le lecteur et l’import, puis publie uniquement dist/. Dans les réglages du dépôt, choisir GitHub Actions comme source de Pages. Un envoi sur main déclenche la vérification et la publication ; une pull request déclenche les vérifications sans publication. Ne pas envoyer sur main sans l’accord de publication du propriétaire.

Les liens, sons et modules utilisent des chemins relatifs et fonctionnent sous le sous-dossier du dépôt GitHub Pages. Le contenu de .openai/ et l’ancien historique Sites ne font pas partie de ce dépôt autonome.

## Passage depuis l’ancienne adresse

Les partitions importées, les audios générés pour ces partitions et les réglages sont stockés dans le navigateur et dépendent de l’adresse du site. Ils ne sont pas copiés entre les deux adresses. Conserver les fichiers MusicXML originaux pour les réimporter sur la nouvelle adresse. L’ancien site doit rester accessible pendant la transition.

Le morceau pilote et le catalogue audio fourni dans ce dépôt fonctionnent directement sur la nouvelle adresse.

## Composants et sources

Les notices et provenances des composants fournis sont conservées sous dist/vendor/, notamment eSpeak NG (GPL-3.0-or-later) et fflate. Les partitions de démonstration conservent leurs indications de provenance dans dist/import-examples/. Les références du catalogue sont documentées dans tools/catalogue/README.md et dist/catalogue-audio/index.json.

Aucune nouvelle licence n’est ajoutée au code propre au projet par cette migration.

## Banc de test du débit syllabique

Ouvrir [tempo-bench.html](dist/tempo-bench.html). Il compare les 29 syllabes d’Exaudi nos à 175 mots/minute avec un time-stretch sans plafond, à hauteur conservée. Le lecteur principal utilise une fenêtre de 40 ms. Les syllabes trop longues sont accélérées pour viser le début de la suivante ; les plus courtes gardent leur durée. La fin audible est conservée, avec quatre voix fixes pour les chevauchements résiduels. Le pilote et Exaudi sont préparés à 175 ; les sons manquants des imports sont générés à 175 et conservés sur l’appareil. Les anciens imports sont migrés lors de leur ouverture. L’ancien catalogue à 145 reste une archive et ne sert plus de source aux syllabes du lecteur.

Le banc garde un tempo réglable de 30 à 320 et trois fenêtres pour comparaison (40 ms par défaut). Un facteur très élevé peut dégrader l’intelligibilité ; aucun plafond artificiel n’est appliqué.

Le traitement WSOLA SoundTouchJS 0.3.0 est calculé sur l’appareil avant de programmer les buffers ; il n’altère pas les fichiers source. Les bibliothèques et licences sont fournies localement. Régénération des sons : `node --expose-gc prepare-tempo-bench.mjs`. Vérification du traitement, de la hauteur et des commandes : `node check-tempo-bench.mjs`. L’écoute reste le critère pour choisir les paramètres.
