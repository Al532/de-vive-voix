# Audit du 23 septembre 2026

Périmètre : page actuelle, navigation et focus, lecture vocale et musicale, modèle des blocs, mémorisation, anciennes URL, préparation de la partition et tests. Audit du code et tests automatisés ; aucune validation physique de TalkBack, NVDA ou d’une plage braille.

## Corrections

| Constat | Correction et vérification |
| --- | --- |
| Précédent/suivant exécutait une action dès la prise de focus et ignorait ensuite un clic dans les 500 ms. Le mécanisme vient des anciennes variantes d’essai. | Suppression de `autoStep`, de `onfocus`, du filtrage temporel et des indicateurs associés. Tests : explorer les boutons ne joue rien et ne déplace pas la position ; deux activations successives sont prises en compte. |
| Le rendu remplaçait les textes des boutons, du titre et les attributs accessibles même lorsqu’ils étaient identiques. | Mise à jour uniquement lorsque la valeur change ; conservation des éléments des boutons. Cela réduit les mutations inutiles, sans prétendre prouver la disparition du saut de focus TalkBack. |
| Une exception de `history.replaceState` interrompait le rendu avant le lancement de l’audio. | L’URL et le stockage sont facultatifs et protégés indépendamment. Tests : démarrage et lecture avec historique et stockage refusés. |
| Une absence ou une erreur de synthèse vocale empêchait toute la lecture d’un bloc. | Annonce de l’indisponibilité puis musique seule. Tests : synthèse absente, erreur de voix et erreur tardive d’une ancienne demande. |
| Le rejet de `AudioContext.resume()` pendant une syllabe pouvait produire une promesse rejetée sans gestion ; les erreurs de génération du son dans le rappel vocal échappaient également au bloc `try` initial. | Gestion immédiate du refus audio et protection du rappel différé. Test de refus avant la fin de la parole, sans note indésirable. |
| Le passage en arrière-plan ne déclenchait pas forcément `pagehide` ; une séquence pouvait rester active. | Arrêt sur `visibilitychange` lorsque la page devient masquée. Tests d’annulation de la parole en attente et de la lecture musicale ; aucun redémarrage au retour. |
| Une annonce d’erreur restait présente après une nouvelle action. | Effacement au début de l’action suivante. |

## Vérifications conservées

- Découpage des cinq voix : couverture des mesures actives, densité, texte et extension limitée à la première note principale suivante ; aucune discordance détectée entre le texte du pilote et sa limite d’extension.
- Parcours du bloc jusqu’à sa note d’extension, écoute globale du bloc suivant, puis première note isolée ; bornes du morceau sans boucle involontaire.
- « Travailler ce bloc » joue immédiatement la première note et place le focus sur le bouton suivant, sans avance supplémentaire.
- Une nouvelle action annule la lecture précédente ; les rappels tardifs ne jouent pas d’ancienne note.
- Voix latine prioritaire, puis italienne ; choix actualisé lors de chaque lecture.
- Reprise de la dernière voix et du dernier bloc, sans lecture au chargement.
- Boutons HTML natifs, ordre de lecture cohérent, indication du focus et absence d’insertion de contenu utilisateur en HTML.
- Les quatre anciennes pages redirigent vers la page actuelle. Aucun ancien contrôleur interactif n’y est encore chargé.
- Le fichier de partition préparé est inclus dans le site ; le script Python de préparation n’est pas exécuté à la lecture.

## Limites et points à suivre

- Le saut vers le début de page rapporté avec TalkBack n’a pas été reproduit dans cet environnement. Les boutons étaient déjà conservés dans le DOM ; il ne s’agissait pas d’une reconstruction complète de la page.
- La synthèse vocale du navigateur et les annonces de TalkBack restent deux systèmes distincts. Leur interaction et les voix disponibles dépendent du téléphone et du navigateur. Au moment de cet audit initial, aucune borne ne protégeait contre une absence de fin ou d’erreur. Ce point est traité par le correctif « Attente vocale et TalkBack » ci-dessous.
- Le focus demandé après « Travailler ce bloc » reste intentionnel. Vérifier sur mobile que le curseur TalkBack arrive bien sur le bouton suivant.
- `aria-braillelabel` reste expérimental dans ce prototype ; le support et le rafraîchissement réel dépendent du lecteur et du matériel.
- Du CSS inutilisé subsiste pour les anciennes interfaces, sans gestionnaire actif. La préparation de partition reste spécifique à ce pilote (108 mesures et chemin de secours ancien si l’original inclus est supprimé).
- L’outil d’automatisation `select_note` emploie des indices d’événements incluant les silences ; sélectionner un silence est réaligné sur une note du bloc. Ce comportement ne concerne pas les boutons et mériterait une clarification si cet outil devient un parcours utilisateur.

## Validation

Commande : `node check.cjs` (Node avec erreurs de promesses non gérées traitées comme échecs). Tests de navigation, modèle, audio simulé, annulation, refus de stockage/historique, erreurs vocales et arrière-plan. Vérification syntaxique JavaScript et Python, ainsi que `git diff --check`.

Essai mobile recommandé : explorer sans activer, double appui sur suivant, répétition de plusieurs doubles appuis, entrée dans le travail d’un bloc, franchissement de sa fin, mise en arrière-plan pendant une écoute. L’exploration doit rester silencieuse et conserver la position ; chaque activation doit produire une seule action.

Références : [W3C — activation et focus](https://w3c.github.io/wcag/techniques/general/G107) ; [HTML — historique et restrictions des changements d’URL](https://html.spec.whatwg.org/multipage/nav-history-apis.html).

## Complément — activation TalkBack et résultat (23 septembre 2026)

Défaut reproduit avec le moteur vocal simulé avant correction : sur « Note suivante », l'événement vocal `interrupted` ou `canceled` de la demande courante laissait le surlignage avancer mais ne déclenchait jamais la note. Le test échouait avec zéro note jouée au lieu d'une. Cela prouve le défaut du chemin d'erreur, pas que TalkBack est l'origine de chaque interruption observée sur le téléphone.

Corrections :

- La demande courante joue sa note après une erreur vocale, interruption comprise. Une demande remplacée, arrêtée par Échap ou annulée en arrière-plan reste ignorée grâce au numéro de demande.
- Une seule fin est acceptée par syllabe : les événements fin/erreur répétés ne jouent pas plusieurs notes. Une exception immédiate du moteur vocal laisse également jouer la note.
- Chaque activation annule la parole précédente une seule fois, uniquement si une parole est encore en cours ou en attente. La transition bloc → première note conserve la même demande sans nouvelle annulation.
- Une interruption vocale n'ajoute pas une annonce d'erreur TalkBack au moment où la musique démarre.
- Les attributs `aria-disabled` et la classe de navigation ne sont plus réécrits à chaque note quand leur valeur ne change pas. Boutons natifs conservés ; aucun gestionnaire de toucher/double-clic, aucune action au focus ni temporisation bloquant les activations. L'affichage des paroles et du surlignage reste `aria-hidden`.

Validation : tests d'interruption courante, rappel périmé, fin/erreur répétés, erreur synchrone, annulation unique, absence de mutations d'attributs des boutons sur un pas ordinaire, focus DOM, parcours interblocs et prolongations des cinq voix. `node check.cjs`, `node --check dist/lab.js`, `git diff --check`.

Limite : pas de TalkBack Android réel dans cet environnement. Le focus DOM simulé ne prouve pas le maintien du curseur d'accessibilité Android. Les changements de nom nécessaires du bouton aux frontières des blocs et le transfert de focus demandé à l'entrée en mode travail peuvent encore déclencher une annonce TalkBack concurrente ; la page ne dispose pas d'un signal de fin de parole de TalkBack. Le cas d'un moteur vocal ne renvoyant ni fin ni erreur reste à observer sur appareil.

Référence de l'API : [MDN — erreurs de synthèse vocale](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisErrorEvent/error).

## Complément — notes muettes sur iPhone (23 septembre 2026)

Signalement : la parole fonctionne en navigation ordinaire sur iPhone, mais aucune note ne sonne. Deux fragilités repérées dans le code : absence de configuration de la session audio (Web Audio reste soumis au mode silencieux sur iOS), et vérification du contexte seulement avant la parole, sans reprise s'il est interrompu entre-temps. Ces constats ne déterminent pas à eux seuls la cause sur l'appareil de l'utilisatrice.

Corrections :

- Demande de `navigator.audioSession.type = 'playback'` avant la création du contexte, lorsque cette API est disponible ; son absence ou un refus ne bloque pas la lecture.
- Conservation du déverrouillage audio dans l'activation native du bouton, avant toute attente de la parole. Aucun nouveau gestionnaire tactile ou de focus.
- Nouvelle vérification et reprise du contexte après la parole, pour les notes et les blocs. Une nouvelle action, Échap ou la mise en arrière-plan invalide toujours les résultats différés.
- Remplacement d'un contexte fermé lors de l'activation suivante.

Validation : `node check.cjs`, `node --check dist/lab.js`, `git diff --check`. Tests simulant un contexte initialement suspendu, une interruption pendant la parole, une reprise différée annulée, un contexte fermé et une API de session refusée. Les tests existants couvrent également les navigateurs sans cette API et le refus de déverrouillage audio. Navigation, surlignage, prolongations et ordre texte/musique conservés.

Limite : aucune validation physique iPhone/Safari disponible ici. Sur les versions sans Audio Session API, le mode silencieux peut encore couper Web Audio. Essai à faire sur appareil après rechargement : rejouer un bloc, travailler sa première note, avancer, rejouer le début, puis revenir après une mise en arrière-plan ; comparer avec et sans mode silencieux.

Références : [WebKit — Web Audio et mode silencieux, solution à partir d'iOS 17](https://bugs.webkit.org/show_bug.cgi?id=237322#c6) ; [MDN — états et reprise du contexte audio](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state).

### Précision utilisateur et compatibilité iOS 16.0.2

L'utilisateur confirme : iPhone 11, Safari sous iOS 16.0.2, mode silencieux désactivé ; la version 25 ne rétablit pas les notes. La configuration Audio Session ajoutée précédemment n'existe pas sur cette version d'iOS et n'explique donc pas le silence observé à elle seule.

Ajout d'une amorce Web Audio : un tampon nul d'un échantillon est démarré dans le clic natif, avant toute attente et avant la parole. `resume()` est appelé dans ce même clic. Cette méthode de compatibilité mobile est notamment documentée par Howler. La fin de l'amorce confirme sa lecture ; elle est déconnectée ensuite et partagée par les activations suivantes du même contexte. Une annulation empêche une amorce périmée de marquer le contexte comme prêt. Aucun nouveau gestionnaire de toucher ou de focus, aucune lecture au chargement. L'URL du script comporte un suffixe de version pour renouveler son cache après rechargement.

Tests : moteur simulé sans Audio Session API, où `resume()` seul ne déverrouille pas la sortie ; amorce inaudible dans le clic, puis musique après parole, pour bloc et note ; réutilisation et annulation. Ce nouveau test échoue avec le code précédent et réussit avec le correctif. Suite de navigation et d'audio existante conservée. Cela valide le mécanisme proposé, sans reproduire ni confirmer la cause exacte sur un iPhone physique.

Référence : [Howler — Mobile/Chrome Playback](https://github.com/goldfire/howler.js#mobilechrome-playback).

### Diagnostic séparé du synthétiseur, de la parole et du lecteur de fichier

Le correctif d'amorçage ne rétablit pas les notes sur l'appareil selon l'utilisateur. Aucun diagnostic définitif n'est établi. Ajout de `audio-test.html` pour un essai physique comparatif :

1. La 440 Hz seul, pendant une seconde, produit par le synthétiseur du morceau.
2. Le même la, précédé de « La » prononcé par le moteur vocal ; journal des événements début/fin/erreur de parole.
3. Un la enregistré en WAV PCM16 mono 44,1 kHz, lu par un élément audio natif sans passer par Web Audio.

Le générateur de notes est extrait sans changement d'oscillateur, de volume ou d'enveloppe dans `note-synth.js`, partagé entre le morceau et les tests 1/2. Chaque test crée son propre contexte pour limiter les effets d'un déverrouillage précédent ; l'ancien est fermé. Les tests s'arrêtent mutuellement et lors de la mise en arrière-plan. Les callbacks périmés et doubles événements ne rejouent pas de note. Au bout de huit secondes sans note programmée, un message signale l'attente ; il ne force pas de lecture pendant la parole.

Le journal conserve localement le navigateur, les états et l'horloge du contexte, les erreurs et les étapes de programmation/lecture. Aucune télémétrie ou transmission automatique. L'utilisateur peut copier le journal. Les messages et le journal ne sont pas des régions d'annonce vocale, afin de ne pas perturber le test. Une fin de lecture logicielle n'est jamais présentée comme une preuve d'audibilité.

Validation : suite du morceau `node check.cjs`, séquences du diagnostic `node check-audio-test.cjs`, syntaxe JavaScript et `git diff --check`. WAV vérifié non nul (RMS ≈ 0,071), durée 1,1 s avec queue silencieuse, fréquence 440 Hz. Pas de validation physique Safari/iPhone disponible : les résultats audibles de ces trois essais sont nécessaires pour départager les hypothèses restantes.

### Résultat sur l'iPhone et amorçage par le lecteur natif

Retour utilisateur sur iPhone 11 / Safari iOS 16.0.2 : le test 1 est muet ; le test 2 ne produit que la parole ; le test 3 joue le fichier. Après le test 3, les tests 1 et 2 deviennent audibles. Le synthétiseur peut donc produire le son sur cet appareil ; la lecture d'un fichier natif débloque sa sortie. Le mode silencieux est désactivé selon l'utilisateur : ne pas réinterpréter ce résultat comme la preuve qu'il était activé.

Correction ciblée sur iOS sans session `playback` fonctionnelle : le premier clic de lecture démarre un WAV silencieux de 250 ms dans un élément audio natif, avant la création/reprise du contexte Web Audio. Le lecteur reste sans attribut `muted` ni volume nul : ce sont les échantillons du fichier qui sont à zéro. Aucun bouton supplémentaire, autoplay au chargement ou boucle permanente.

Notes et blocs attendent la confirmation de démarrage du fichier avant de programmer leur musique. L'amorçage réussi est réutilisé ; les clics rapprochés partagent une tentative en cours. Un refus est géré et permet une nouvelle tentative. Échap, `pagehide` et la mise en arrière-plan arrêtent le lecteur natif et invalident les promesses antérieures ; le retour seul ne déclenche rien, le clic suivant réamorce si nécessaire. iOS moderne utilise la session `playback` et les autres plateformes conservent leur parcours.

Validation : modèle reproduisant le résultat utilisateur (tampon Web Audio muet jusqu'au démarrage d'un fichier natif), première note/bloc, attente du fichier, réutilisation, refus et réessai, clics rapprochés, annulation, retour de l'arrière-plan et absence d'amorce native sur iOS avec Audio Session. `node check.cjs`, `node check-audio-test.cjs`, syntaxe JavaScript et `git diff --check` passent. Le WAV silencieux a 11 025 échantillons PCM16 à 44,1 kHz, tous nuls. Le correctif automatique reste à confirmer par un nouveau démarrage de Safari sans passer par le test 3.

Référence technique du contournement par lecteur natif : [WebKit 237322, commentaire 2](https://bugs.webkit.org/show_bug.cgi?id=237322#c2).


### Attente vocale et TalkBack

Symptôme rapporté : après le double tap sur « Rejouer le bloc », le nom du bouton est à nouveau annoncé et la séquence reste parfois muette. Aucun appareil TalkBack n’est disponible ici : la cause exacte du double tap n’est pas démontrée. Le code actuel utilise déjà des boutons natifs stables et ne déclenche rien à la prise de focus.

Faiblesse confirmée dans le code : `waitSpeech` attendait indéfiniment `end` ou `error`. Une synthèse qui ne les émet pas bloquait donc aussi toute la polyphonie. La lecture naturelle partait dans le même événement que l’activation du bouton, sans laisser de marge à son annonce éventuelle.

Correction :

- Sur Android, les clics sans compteur de pointage (`detail=0`, clavier ou activation d’accessibilité) réservent 700 ms avant la parole. Ce n’est pas une détection de TalkBack et ce délai ne garantit pas la fin de son annonce. Le déverrouillage audio reste immédiat dans le geste utilisateur ; le chemin iOS demeure immédiat.
- Une interruption, une sortie occupée ou l’absence de début pendant 3 s permettent une seule nouvelle tentative après 700 ms. Une deuxième défaillance laisse continuer la musique avec les syllabes enregistrées.
- Après le début, une borne prudente dépend de la longueur du texte et du débit : au moins 8 s. Elle évite l’attente infinie d’une fin manquante, mais peut couper une voix exceptionnellement lente. Notre synthèse est annulée avant le passage à la musique, pour éviter sa superposition.
- Arrêter, Échap, le changement de voix, la navigation et la mise en arrière-plan annulent aussi les délais et la relance. Les événements tardifs sont ignorés. Les récupérations ne créent pas d’annonce supplémentaire qui concurrencerait l’audio.
- Aucun déplacement de focus, changement de nom des boutons ou filtrage/rejet des clics n’est ajouté. Les cinq entrées HTML utilisent la même nouvelle version du contrôleur.

Validation : `node check.cjs` simule le délai Android, une interruption suivie d’une reprise, l’absence de début, l’absence de fin, les événements tardifs et l’annulation pendant un délai ou une relance. Les vérifications de l’ordre texte/musique, des syllabes synchronisées, de la navigation rapide et de l’amorce iPhone continuent de passer. Cela vérifie le contrôleur, pas les annonces réelles ni la reconnaissance du double tap par TalkBack.

### Journal de diagnostic pour la première activation d’un autre bouton

Retour utilisateur après le correctif : Rejouer fonctionne, puis la première activation de Suivant produit une nouvelle annonce « Bloc suivant », une pause et enfin la séquence. Les activations suivantes du même bouton fonctionnent. La version courante (avec suppression des noms braille substitués, de la position mémorisée et des instructions) n’altère pas le nom de Suivant et ne déplace pas le focus dans son gestionnaire.

La distinction entre focus d’accessibilité et focus de saisie Android fournit une hypothèse pour l’annonce supplémentaire, mais ne prouve pas sa cause sur l’appareil. La pause peut venir des délais de récupération de synthèse ajoutés précédemment ; un premier chargement des syllabes reste aussi à distinguer.

Ajout d’un mode explicite `?trace=1` : journal horodaté des clics (`detail`), focus DOM, activation du bloc, disponibilité audio, chargement des syllabes, requête/début/fin/erreur/délai de synthèse et début/fin de musique. Le journal ne permet pas d’observer directement le focus interne ou les annonces de TalkBack. Aucune temporisation de lecture n’est modifiée dans cette étape.

Le panneau « Journal du test » est masqué hors de ce mode et replié au départ. Le journal reste en mémoire de la page, sans stockage ni transmission. L’utilisateur peut l’exporter avec « Copier le journal ». Aucun aria-live, signal sonore ou déplacement de focus automatique n’est ajouté. Le secours manuel de copie sélectionne le texte seulement si l’accès au presse-papiers échoue après l’activation du bouton de copie.

Validation : contrôleur complet et traces de ses défaillances simulées, innocuité d’un collecteur de traces en erreur, mode normal sans accès au panneau, capture focus/clic et export presse-papiers vérifiés. Toujours aucune observation physique de TalkBack.

Référence pour les deux focus Android : https://developer.android.com/guide/topics/ui/accessibility/service#manage-focus

### Correction fondée sur le journal physique TalkBack

Le journal fourni par l’utilisateur établit trois faits :

- Chaque activation arrive comme un clic `detail=1`. Le délai précédent, réservé à `detail=0`, était donc absent (`speech-wait.delay=0`).
- Rejouer puis le premier Suivant reçoivent chacun un `focusin` immédiatement avant le clic. Le deuxième Suivant ne reçoit pas de nouveau focus. Cela concorde avec l’annonce répétée rapportée pour les deux premiers boutons, sans permettre d’observer directement la parole de TalkBack.
- Sur Rejouer, la première demande vocale ne démarre pas ; la relance après 3 s + 700 ms réussit. Sur le premier Suivant, `speech-start` arrive mais aucune fin avant le nouveau clic 6,1 s plus tard, qui annule cette tentative et avance encore d’un bloc. L’audio est déjà actif et les syllabes chargées en moins de 200 ms : le chargement des sons n’explique pas cette attente.

Le délai Android tient désormais compte d’un focus DOM récent sur le bouton activé, y compris avec `detail=1`. La parole attend la fin d’une marge de 1 s depuis ce focus ; une activation répétée après cette marge ne la rajoute pas. Le suivi du focus n’exécute aucune action, ne rejette aucun clic et ne déplace pas le focus. Le déverrouillage audio reste synchrone. La marge antérieure de 700 ms demeure pour les clics `detail=0`. Le parcours iOS est inchangé.

La liste des voix est demandée dès le chargement, sans prononcer de texte, et l’événement `voiceschanged` est observé. Le journal initial passe de `it-IT` à `it_IT`, ce qui est compatible avec une liste initialement vide puis une voix italienne disponible ; ce n’est pas une preuve à lui seul. Cette préparation réduit l’attente de découverte des voix lors du premier clic. Les traces précisent la disponibilité de la liste, la voix sélectionnée, l’âge du focus et le délai appliqué ; version `talkback-focus-2`.

Validation : reproduction simulée d’un `focusin` suivi 1 ms après par un clic `detail=1`, répétition sur le même bouton sans nouveau focus, délai restant lorsqu’un clic survient 800 ms après le focus, annulation pendant l’attente, clics rapprochés conservés, chargement différé de la liste des voix dès l’ouverture et activation iPhone immédiate. Le contrôleur complet continue de passer. La marge de 1 s ne fournit aucune connaissance de la durée réelle de l’annonce TalkBack : la confirmation audible reste nécessaire et le nom du bouton peut toujours être réannoncé par le lecteur.
