# Catalogue audio De vive voix — version 1.0.0

11 625 WAV parlés mono, 22 050 Hz / PCM 16 bits : français 1 569 ; italien 1 218 ; allemand 3 534 ; anglais américain 4 563 ; latin italien et grec liturgique 741. Taille audio exacte : 221 726 646 octets.

## Accès
- Page d'écoute : /catalogue.html
- Index racine : /catalogue-audio/index.json
- Index par langue : /catalogue-audio/v1/{fr,it,de,en-US,la}/index.json
- Sons : URL relative à leur index de langue.
- Formules liturgiques : /catalogue-audio/v1/liturgical-words.json
- Rapport automatique : /catalogue-audio/verification.json

Un identifiant audio est le début SHA-256 de voix + mnémotechnique phonétique explicite + débit + version du chargeur. Les index conservent la forme source, le code eSpeak demandé, l'IPA réellement annoncé par le moteur, la durée, les octets et l'empreinte SHA-256 du WAV. Les données de corpus et les bibliothèques natives ne sont pas redistribuées avec le site.

## Reproduction
Utiliser Python avec numpy et une installation isolée de espeakng-loader==0.2.4. Les corpus exacts, URL et SHA-256 figurent dans l'index racine. Le téléchargeur est download-corpora.py. Les données demeurent hors de la copie du site.

1. select-syllables.py --corpora <dossier-corpus> --output <sélection>
2. generate.py --runtime <dossier-paquet-espeak> --selection <sélection> --output <dist/catalogue-audio>
3. verify.py <dist/catalogue-audio>

Le lot est choisi à 99 % des occurrences syllabiques de chaque base. Le latin est converti en contexte à partir des mots et frontières GABC avant le classement. Les formules Kyrie, Christe eleison, Hagios/Agios o Theos, ischyros, athanatos, himas/imas, ainsi que Amen, Alleluia, Hosanna, mihi et nihil sont incluses indépendamment du seuil. Les mêmes sons sont réutilisés et indexés sous toutes les formules pertinentes.

Le supplément grec suit la lecture liturgique dans la tradition latine romaine, pas un profil universel de langue grecque. Références :
- Liber Usualis, préface : https://www.sjsu.edu/people/gordon.haramaki/courses/practice/s1/Liber-Usualis-Preface.pdf
- Klarmann, Gregorian Chant, §22 : https://media.churchmusicassociation.org/books/gregorian-chant-klarmann.pdf
- Livret Vatican Vendredi saint 2025 : https://www.vatican.va/news_services/liturgy/libretti/2025/20250418-libretto-venerdi-passione.pdf

## Périmètre de validité
La couverture est une mesure dans le corpus de référence, et ne signifie pas que 99 % des morceaux sont intégralement préparés. La source anglaise a une transcription pour 98,612 % des occurrences de mots de SUBTLEXus ; les variantes d'un mot sont pondérées également.

Les lots fr/it/de/la utilisent un accent isolé de démonstration comme le pilote. Le lot anglais conserve l'accent source. La hauteur musicale reste portée par le synthétiseur instrumental du lecteur.

Approximation eSpeak explicitée pour le /ɥ/ français ; fusion possible de /œ̃/ et /ɛ̃/. Onze syllabes allemandes à voyelle nasale d'emprunt interprètent la notation caret comme une nasalisation : convention d'origine non encore indépendamment confirmée. Chaque entrée concernée porte sa note, visible dans la page.

Les 11 625 WAV ont été rouverts indépendamment ; paramètres, nombre d'échantillons, présence de signal et empreintes ont été contrôlés. Les phonèmes réellement rapportés par eSpeak figurent pour chaque son. Ce contrôle ne remplace pas une validation humaine de toutes les prononciations.

## Intégration
Cette version ajoute la bibliothèque et sa page de consultation. L'import MIDI/MusicXML automatisé et le générateur dans le navigateur restent un chantier séparé. Aucun fichier ou réglage du lecteur du pilote n'est remplacé.

Sources :
- Lexique 3.83 — https://www.lexique.org/databases/Lexique383/README-Lexique.txt
- PhonItalia 1.10 — https://stefanocoretta.github.io/phonItaliaR/
- German Syllable Frequencies — https://github.com/petrawagner/german-syllable-frequencies
- SUBTLEXus + CMU syllabifié — https://blairarmstrong.net/tools/Union_Subtl_CMUPron/index.html
- GregoBaseCorpus 0.4 — https://github.com/bacor/gregobasecorpus

