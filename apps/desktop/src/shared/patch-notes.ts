export type PatchNote = { version: string; date: string; items: string[] };

// Newest first, as they are shown. Publishing refuses a version that has no notes here.
export const PATCH_NOTES: PatchNote[] = [
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
