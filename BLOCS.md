# Lecture de « De vive voix »

## Protocole des blocs conservé

La taille choisie, de 1 à 8 mesures (2 par défaut), est une taille cible. Elle paramètre le découpage historique de chaque voix ; elle ne crée pas une grille fixe commune aux cinq voix. Au réglage de 2 mesures, les blocs sont strictement identiques à ceux de la version d’origine.

Le lecteur conserve les règles musicales et textuelles : séparation des phrases après un silence d’au moins deux mesures locales, saut des passages sans voix, préparation automatique d’une mesure à la reprise d’une phrase, adaptation à la densité des notes et au budget de texte (32 cellules estimées par défaut). Un bloc dense est raccourci ; un bloc peu chargé peut être agrandi. Les mots restent complets. La fenêtre maximale de préparation et de prolongement est de deux fois la taille cible, comme les quatre mesures du réglage historique de deux mesures.

La fin d’un bloc inclut la première note principale suivante, jusqu’à sa fin, si elle appartient à la même phrase et tient dans cette fenêtre. Les notes tenues ne sont pas tronquées. Pendant le prolongement, la polyphonie ne démarre plus de nouvelles attaques après le début de cette note ; les notes engagées résonnent jusqu’à la fin. À une fin de phrase, un temps d’accompagnement est conservé. Si un petit bloc de clôture est déjà entièrement entendu dans le prolongement précédent, il est fusionné avec celui-ci.

Exemple pour la voix 1 : au réglage de deux mesures, le bloc 41–42 absorbe la mesure 43 (« amen »). Le bloc suivant reprend le chant en mesure 53, avec la préparation musicale existante, et les mesures sans voix 44–52 ne deviennent pas des blocs de travail.

## Amorce et navigation

L’option « Inclure la mesure précédente en amorce » ajoute une mesure avant le début principal du bloc, sans supprimer une préparation déjà prévue par le protocole. Le premier bloc reste inchangé. Les numéros, les mesures principales, précédent/suivant et la position mémorisée restent ceux du bloc. Cette amorce concerne chaque répétition d’un bloc et ne concerne pas la lecture complète.

« Aller à la mesure » sélectionne sans jouer le bloc chanté correspondant. Si la mesure est dans un passage sans chant, il sélectionne le prochain bloc chanté, ou le dernier bloc à la fin du morceau. Précédent/suivant parcourent les blocs existants et sautent ainsi les passages sans voix. Chaque déplacement déclenche automatiquement le texte naturel, puis la musique et les syllabes du bloc sélectionné. Une nouvelle navigation annule la lecture précédente ; aux extrémités, le bouton indisponible ne relance rien.

Un changement de taille conserve comme repère la première mesure du bloc sélectionné. Il arrête une lecture par blocs ; en lecture complète, il recalcule seulement le découpage sans déplacer le transport. Un changement d’amorce arrête la lecture par blocs en conservant le bloc.

## Lecture et transport

En mode blocs, le texte du passage est lu naturellement par speechSynthesis avant la musique et les syllabes synchronisées. Le texte et les syllabes comprennent la préparation, l’amorce éventuelle et le prolongement. En mode morceau entier, la lecture préalable du texte est supprimée. La lecture complète conserve les passages instrumentaux et ne dépend pas du découpage des blocs.

Pause conserve la position exacte ; reprise conserve l’offset des syllabes en cours. Arrêt revient au début du passage, préparation et amorce comprises pour un bloc. Les déplacements d’une mesure en lecture complète conservent l’état lecture/pause. Le tempo commun aux deux modes (30–160) change pendant l’écoute sans recommencer le passage.

Le transport partage une horloge AudioContext entre notes et syllabes. Il programme une fenêtre de 250 ms, renouvelée toutes les 25 ms. Déplacement, pause et changement de tempo annulent les sources programmées. Les notes liées sont fusionnées. Les syllabes ne sont répétées ni sur les liaisons ni sur les mélismes ; une entrée sur une continuation rappelle sa voyelle. Les variantes audio sont décodées avant le départ. Les gains instrumentaux restent .13 pour la voix travaillée et .014 pour les autres parties.

L’activation audio et l’amorce média silencieuse des anciens iPhone/iPad sont conservées. Un onglet masqué met le transport en pause. La lecture naturelle est annulable par Arrêter, Échap, navigation, changement de voix/taille, nouveau lancement et masquage de la page. Elle garde les marges prévues pour VoiceOver/TalkBack et une attente bornée si la synthèse ne répond pas.

## Mémoire et parcours accessible

La mémoire locale est isolée par partition. Elle conserve la voix, le tempo commun et, pour chaque voix, la position, la taille et l’amorce. En lecture complète, la position est actualisée à chaque mesure. Le rechargement restaure le bloc correspondant sans son automatique. L’amorce ne déplace jamais la position enregistrée vers le bloc précédent. Si le stockage est refusé, le lecteur reste utilisable et affiche une information.

Le repère ouvre la page, suivi du champ de mesure prérempli, « Aller », « Recommencer au début » et « Jouer le bloc ». Les réglages de taille et d’amorce viennent ensuite ; la voix reste directement accessible en fin de parcours, sans sous-menu.

Les commandes sont natives. Les boutons indisponibles portent aria-disabled et restent repérables au clavier ; leurs gestionnaires ignorent les actions impossibles. Les actions ne déplacent pas le focus. Le repère présente les mesures principales avec la préparation ou l’amorce éventuelle, sans ajouter la voix ni annoncer le prolongement comme une mesure entière. Les changements de mesure pendant la lecture ne sont pas annoncés automatiquement ; les actions et fins de lecture sont annoncées.

Les cinq pages index, boutons, liste, pas et syllabe utilisent le même lecteur. Les outils WebMCP de consultation et sélection de bloc restent disponibles.

## Vérifications de cette correction

- Comparaison exacte des blocs historiques : cinq voix et trois budgets de texte (8, 32, 160), au réglage de deux mesures.
- Huit tailles, cinq voix, deux options d’amorce, trois tempos (30, 80, 160) : 45 279 placements syllabiques vérifiés.
- Fusion de clôture, saut des silences et préparation de reprise vérifiés pour les huit tailles.
- Transport simulé : arrêt des sources programmées, pause/reprise, déplacement, tempo, notes tenues/liées, prolongement et lecture complète.
- Interface simulée : mémoire par voix, restauration à l’arrêt, navigation dans les silences, synthèse naturelle avant les blocs seulement, annulation et activation iOS.
- Navigateur intégré : mesures 42–43 fusionnées au réglage 1 ; saut vers 53 ; bloc 41–43 et 44 blocs au réglage 2 ; conservation du focus après navigation.
- Les parcours VoiceOver/TalkBack et l’écoute sur un appareil physique restent à valider.

La correction est disponible dans la prévisualisation locale ; elle n’est pas publiée.
