# Import MusicXML — De vive voix

L’import conserve toutes les parties, instruments et voix internes. La voix à travailler se choisit dans le lecteur, après préparation. Formats XML et MXL, partwise et timewise, encodages courants, limite 20 Mo de contenu XML. La bibliothèque et les sons créés restent dans IndexedDB sur l’appareil ; aucune parole importée n’est envoyée à un service. La lecture naturelle préalable des blocs importés utilise en priorité une voix locale de l’appareil dans la langue du couplet (italien pour le latin si nécessaire). Si cette voix manque ou échoue, le moteur WebAssembly lit la phrase entière et la conserve sur l’appareil. Les voix distantes ne sont pas utilisées pour les paroles importées. Le morceau entier commence directement avec musique et syllabes ; les blocs conservent texte naturel puis musique.

## Lecture musicale

Les divisions, anacrouses explicites, accords, silences, changements de mesure, transpositions, triolets/durées rationnelles, liaisons et notes d’agrément sont lus. Les reprises avant/arrière et fins numérotées sont développées avec une limite de parcours. Les numéros du lecteur suivent alors le parcours déplié, indiqué dans les informations du morceau. Les Da capo, Dal segno et Coda restent dans l’ordre écrit et sont signalés. Le tempo initial est repris ; les changements de tempo internes restent sous le réglage commun du lecteur, avec information lorsqu’ils existent. Les percussions sans hauteur sont signalées et restent silencieuses.

Les identifiants de couplets sont normalisés par partie, y compris « part1verse1 ». Chaque couplet est conservé. Les langues des traductions sont détectées séparément ; le premier couplet utilise la langue choisie à l’import. La langue automatique est une estimation par métadonnées et mots fréquents, pas une classification universelle. Les notes restent aux hauteurs instrumentales ; les syllabes conservent une intonation parlée. Le protocole adaptatif historique reste celui des blocs.

## Sons

Le latin italien et le grec liturgique utilisent les règles déterministes existantes, avec translittération de l’alphabet grec. Les autres langues utilisent eSpeak NG local en WebAssembly : d’abord le mot entier, puis les fragments de référence. Un alignement par distance de phonèmes conserve les frontières musicales ; les voyelles sont des repères lorsque leur nombre correspond au découpage. Les voyelles françaises isolées ne sont pas lues comme des noms de lettres. Un e final écrit sur sa propre syllabe musicale reçoit un schwa lorsqu’il est absent de la prononciation parlée.

Les marqueurs de pause et de changement de langue ne sont pas des phonèmes à synthétiser. Les correspondances du catalogue ignorent les marques d’accent. Les sons absents sont synthétisés à 145 mots/minute et mis en cache ; une variante à 450 est préparée si nécessaire pour les passages rapides. La synthèse est séquentielle dans un Worker, recyclé après quatre opérations afin de borner sa mémoire. La lecture recharge les WAV locaux ou ceux du catalogue et conserve le transport, la pause et le tempo.

La prononciation et l’alignement sont automatiques et comportent des approximations. Une frontière sans son reconnu échoue explicitement, sans remplacer silencieusement la syllabe par une voyelle arbitraire. Les fichiers générés sont contrôlés : RIFF, mono PCM 16 bits 22 050 Hz, signal audible, durée, gain et bords silencieux.

Moteur WebAssembly : espeak-ng npm 1.0.2, version observée 1.52-dev, GPL-3.0-or-later. Loader et binaire inchangés ; adaptateur local documenté (UTF-8, phonémisation par lots avec séparation de phrases, instance fraîche par opération). Sources : https://github.com/ianmarmour/espeak-ng.js et https://github.com/espeak-ng/espeak-ng. Licence et provenance dans dist/vendor. Décompression fflate 0.8.3, licence MIT dans dist/vendor/fflate-LICENSE.txt. Le catalogue enregistré auparavant reste eSpeak NG 1.52.0.

## Validation

- check.cjs : le pilote et son protocole historique, 45 279 placements, transport, lecture naturelle et annulation.
- check-import.cjs : Belissen fourni + six éditions vocales libres, tous couplets, quatre tailles de bloc, notes, accords, transposition, anacrouse, fins de reprise, timewise, erreurs XML et liaisons polyphoniques.
- check-import-speech.mjs (Node --expose-gc) : vrai moteur WebAssembly, tous les textes/couplets/langues, génération de WAV absents, cache réutilisé, aucune syllabe planifiée sans son. Le couplet français et la traduction italienne de Fauré sont vérifiés séparément.
- Navigateur : import par sélecteur MXL, préparation locale, ouverture de Belissen, lecture complète, couplets de Fauré et conservation de la bibliothèque.

Rapports : dist/import-examples/verification.json et speech-verification.json. Exemples CC0 OpenScore Lieder (Abbott, Fauré, Schubert, Rossini, Holmès) et Kyrie de Mark Feezell, avec provenance et empreintes. Le MusicXML Belissen du pilote n’est pas modifié.

Les parcours VoiceOver/TalkBack sur appareils physiques restent à vérifier. L’import MIDI constitue l’étape suivante ; cette version accepte uniquement MusicXML.
