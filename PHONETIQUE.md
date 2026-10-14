# Atelier de rapprochement syllabes–phonèmes

Page : `/phonetique.html`. Le parcours audio existant reste indépendant.

`prepare-phonetics.py` extrait les syllabes originales du MusicXML Belissen, leur type et les notes associées. Les 285 occurrences de mots des cinq parties vocales sont conservées dans `dist/phonetics-score.json`. L'interface regroupe les occurrences de même découpage dans chaque voix, affiche la première et exporte toutes leurs références.

`phonetics-engine.js` propose un G2P volontairement limité au latin ecclésiastique romain. Chaque règle émet des sons avec la plage de lettres et la syllabe d'origine : aucun alignement n'est perdu lors de la conversion. Les règles consultent le mot entier, tout en respectant les hiatus imposés par les frontières (par exemple Spiritu-i). Si un groupe consonantique traverse une frontière, il est provisoirement attaché à la première syllabe et explicitement signalé comme à vérifier.

Une transcription externe facultative est comparée aux sons de référence par programmation dynamique (coût unitaire d'insertion, suppression et substitution). Les sons de la transcription sont affectés aux syllabes des sons de référence. Toute divergence ou pluralité de chemins optimaux entraîne une demande de vérification ; ce n'est pas un alignement universel ou une mesure de confiance linguistique. Les marques d'accent, séparateurs et barres API sont ignorés pour cette comparaison. Les marques de longueur sont conservées et signalent un écart. Le g ASCII est normalisé en ɡ.

Limites : pas d'accentuation lexicale, d'analyse contextuelle entre mots, de modèle de chant. Transcription large e/o ; géminées, variantes s/z, i/u consonantiques et groupes traversant une frontière demandent vérification. Aucune proposition n'est étiquetée « validée ». L'export JSON porte toujours reviewRequired=true. La génération phonétique fonctionne localement et aucun texte n’est envoyé à un service distant pour celle-ci. La comparaison optionnelle utilise le service vocal de l’appareil.

Validation : `python prepare-phonetics.py` puis `node check-phonetics.cjs`. Cas testés : conservation des 285 occurrences, ci/ti/sti, ae/hiatus, groupes traversants, conservation des phonèmes externes et ambiguïtés d'alignement.

## Essai audible

`generate-phonetics-audio.py` utilise espeakng-loader 0.2.4, eSpeak NG en mode synchrone et entrée explicite `[[ phonèmes ]]` (flags 0x101), inventaire italien. L’API affiché est converti en mnémotechniques du moteur. Le r est explicitement `r/` (trille) : `r` seul donnerait une approximante anglaise en entrée phonétique brute. Chaque syllabe isolée porte un accent de démonstration sur sa première voyelle ; cela ne prétend pas reconstruire l’accent lexical du mot.

Le générateur vérifie le retour phonétique réel du moteur pour chaque fichier : une divergence avec les phonèmes demandés fait échouer la génération. Les 32 syllabes/voyelles produisent 15 séquences distinctes pour tout le corpus. Les séquences concatènent les fichiers de syllabes avec 180 ms de silence ; il ne s’agit pas de mots synthétisés en continu. PCM mono 22 050 Hz 16 bits, fichiers WAV servis par le site et lus avec HTMLAudioElement. Aucune dépendance à Web Audio pour cette page.

Les commandes précédentes sont interrompues avant chaque nouvelle lecture, modification ou changement de mot. Une génération d’événements empêche les retours d’une ancienne lecture de modifier le statut courant. Le surlignage suit les repères temporels de la séquence. La comparaison lit le mot écrit avec une voix latine ou italienne disponible ; absence de voix signalée sans repli français. Les transcriptions modifiées n’ont de son que lorsqu’elles correspondent à un fichier déjà préparé : aucun remplacement par la voix orthographique n’est effectué.

Les fichiers générés ne redistribuent ni le binaire ni les données du moteur eSpeak NG ; seul le générateur dépend du paquet local.

## Hauteurs réelles et mélange avec le synthé

`generate-belissen-pitch.py` sélectionne huit attaques réelles (pas des prolongations) couvrant les cinq parties vocales, de MIDI 46 à 80. Chaque hauteur, syllabe, partie et numéro de mesure est recroisé avec le MusicXML original. Accord de référence : la = 440 Hz. Les durées restent celles de la synthèse, sans restitution rythmique de la partition.

Une copie temporaire des données eSpeak contient des voix à hauteur constante (`pitch N N`, flutter et roughness à zéro). Avec cette version et pitch=50, les essais montrent environ -9 Hz entre la valeur du fichier voix et le signal. Réglage utilisé : `round(cible + 9)`. Aucune transposition ou modification de fréquence par rééchantillonnage. La F0 est mesurée par autocorrélation sur plusieurs fenêtres de 90 ms dans la voyelle isolée, sur une plage non contrainte par la cible de 70–1100 Hz. Les huit écarts médians sont inférieurs à 7 cents. Cela mesure la justesse des voyelles testées, pas leur intelligibilité ni une garantie sur toutes les syllabes.

Le mélange utilise une onde triangulaire limitée en harmoniques, de même type que NoteSynth, à la fréquence exacte de la note. Le synthé commence 120 ms avant la syllabe pour donner le repère. Deux variantes permettent de comparer la syllabe accordée et la syllabe parlée d’origine. Deux niveaux de voix : -9 dB ou -3 dB RMS par rapport au synthé, avant limitation commune des crêtes. Tous les mélanges sont des WAV déjà préparés, pour garder une lecture HTML audio fiable sur mobile. Les lecteurs de l’atelier s’interrompent mutuellement.
