import type { ActionError } from '../../../shared/ipc';

export const errorMessage = (error: ActionError): string => {
  switch (error) {
    case 'code_not_found':
      return 'Ce code ne correspond à aucune party. Vérifie-le avec tes potes.';
    case 'party_full':
      return 'Cette party est pleine : 10 personnes sont déjà connectées.';
    case 'rate_limited':
      return "Trop d'essais. Attends quelques minutes avant de réessayer.";
    case 'invalid_request':
      return 'Vérifie ton pseudo et le code.';
    case 'unauthorized':
      return "Tu ne fais plus partie de cette party.";
    case 'network':
    case 'not_found':
      return 'Impossible de joindre le serveur. Vérifie ta connexion et réessaie.';
  }
};
