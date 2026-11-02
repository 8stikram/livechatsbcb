export type PatchNote = { version: string; date: string; items: string[] };

// Newest first, as they are shown. Publishing refuses a version that has no notes here.
export const PATCH_NOTES: PatchNote[] = [
  {
    version: '0.11.0',
    date: '2 novembre 2026',
    items: [
      'Toute l’app bouge en douceur, façon Apple',
      'Les onglets glissent, et leur marque suit celui que tu choisis',
      'Envoyer fait un petit rebond avec une coche : tu vois que c’est parti',
      'Les listes arrivent en cascade et se décalent quand une ligne part. Un pote qui arrive ou qui part s’anime aussi',
      'Fenêtres, emojis, bandeaux et favoris s’animent, et les barres d’envoi ont un léger reflet',
      'Le logo s’affiche moins d’une seconde au lancement, pas après une mise à jour',
      'Nouvelle case dans les réglages : Réduire les animations. Ce qui s’affiche en jeu ne change pas',
    ],
  },
  {
    version: '0.10.0',
    date: '2 novembre 2026',
    items: [
      'Ctrl+V depuis n’importe quel onglet : une image, une vidéo ou un son copié prépare ton LiveChat',
      'Colle le lien direct d’une image, d’un GIF ou d’une vidéo, l’app le récupère pour toi',
      'Clic droit sur un fichier dans Windows : « préparer » ou « envoyer direct ». Une image et un son sélectionnés ensemble font un seul LiveChat',
      'Emojis dans le texte, avec les mêmes dessins que Discord',
      'Voix robot : une case à cocher pour lire ton texte à voix haute, 200 caractères au maximum',
      'Dans les réglages, chacun peut couper la voix robot, choisir sa voix et sa vitesse',
    ],
  },
  {
    version: '0.9.0',
    date: '2 novembre 2026',
    items: [
      'Mode clean : Shift+F12 coupe tout chez toi, son et image, jusqu’à ce que tu réappuies',
      'Raccourcis en jeu : Shift+F1 à Shift+F10 envoient un fichier ou un LiveChat sauvegardé, avec un petit son de confirmation',
      'Shift+F11 passe le LiveChat en cours sans quitter ton jeu',
      'Anti-spam : le même LiveChat 5 fois en 1 minute, et plus aucun envoi pendant 30 minutes',
      'Clic droit sur un pote dans Party pour l’ignorer 10 minutes, 1 heure ou jusqu’à la fermeture de l’app. Il n’en sait rien',
      'Durée max : coupé chez toi après 20 secondes, à changer dans les réglages. Quand tout le monde a été coupé, on passe au suivant',
      'Les réglages sont rangés en sections',
      'L’interface est un peu plus transparente',
    ],
  },
  {
    version: '0.8.0',
    date: '2 novembre 2026',
    items: [
      'Cette liste des nouveautés, proposée après chaque mise à jour et toujours disponible dans les réglages',
      'Un bouton pour vérifier tout de suite s’il y a une mise à jour',
      'L’app redémarre toute seule pour se mettre à jour, après 3 secondes de compte à rebours, quand rien ne passe',
      'Après ce redémarrage, tu retrouves ton LiveChat en préparation, ton onglet et ta party',
      'Si le réseau coupe pendant un envoi, il repart tout seul au retour de la connexion',
      'Tu peux cliquer sur Envoyer sans connexion : ça part dès que le réseau revient',
    ],
  },
  {
    version: '0.7.0',
    date: '2 novembre 2026',
    items: [
      'Une vraie barre de progression pendant le téléchargement d’une mise à jour',
      'LiveChat devient l’onglet principal',
      'L’onglet Party montre seulement qui est là, ce qui passe et ce qui arrive',
      'Une étoile dans l’historique garde un LiveChat sur ton PC, pour le ressortir même des jours après',
    ],
  },
  {
    version: '0.6.0',
    date: '2 novembre 2026',
    items: [
      'Le mode avancé : plusieurs images à placer, tourner et animer librement',
      'Un petit écran qui montre le rendu avant d’envoyer',
      'Un clic droit complet dans la bibliothèque',
      'Choisir un fichier depuis ta bibliothèque ou depuis ton PC',
    ],
  },
  {
    version: '0.5.0',
    date: '2 novembre 2026',
    items: [
      'Une nouvelle interface en verre fumé',
      'Une image ou une vidéo et un son envoyés ensemble, en un seul LiveChat',
      'La bibliothèque et les LiveChats sauvegardés',
      'L’historique, avec « Revoir pour moi » et « Rejouer pour tous »',
      'L’app reste près de l’horloge et peut se lancer au démarrage de Windows',
    ],
  },
  {
    version: '0.3.1',
    date: '1er novembre 2026',
    items: ['Une croix sur les images rondes pour retirer un serveur ou quitter une party privée'],
  },
  {
    version: '0.3.0',
    date: '1er novembre 2026',
    items: ['La connexion avec Discord, une party par serveur et les vraies photos de profil'],
  },
  {
    version: '0.2.0',
    date: '1er novembre 2026',
    items: ['L’affichage par-dessus les jeux, l’envoi de médias et les réglages'],
  },
  {
    version: '0.1.3',
    date: '1er novembre 2026',
    items: ['Les mises à jour automatiques'],
  },
  {
    version: '0.1.0',
    date: '1er novembre 2026',
    items: ['La toute première version : une party avec un code, à rejoindre entre potes'],
  },
];
