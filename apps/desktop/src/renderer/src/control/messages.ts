import type { ActionError, PartyView, PickResult } from '../../../shared/ipc';

export const errorMessage = (error: ActionError): string => {
  switch (error) {
    case 'code_not_found':
      return 'Ce code ne correspond à aucune party. Vérifie-le avec tes potes.';
    case 'party_full':
      return 'Cette party est pleine : 10 personnes sont déjà connectées.';
    case 'rate_limited':
      return "Trop d'essais. Attends quelques minutes avant de réessayer.";
    case 'invalid_request':
      return 'Vérifie le code.';
    case 'unauthorized':
      return "Tu ne fais plus partie de cette party.";
    case 'signed_out':
      return 'Ta connexion a expiré. Reconnecte-toi avec Discord.';
    case 'forbidden':
      return "Tu n'es pas sur ce serveur Discord.";
    case 'discord_unavailable':
      return 'Discord ne répond pas pour le moment. Réessaie dans un instant.';
    case 'login_denied':
      return 'Connexion annulée sur Discord.';
    case 'login_timeout':
      return "Tu as mis trop de temps à répondre sur Discord. Réessaie.";
    case 'storage_full':
      return 'Le serveur est plein pour le moment. Réessaie plus tard ou envoie un fichier plus léger.';
    case 'queue_full':
      return 'Trop de médias sont déjà en attente. Réessaie dans un instant.';
    case 'cancelled':
      return 'Envoi annulé.';
    case 'gave_up':
      return 'Toujours pas de connexion après 10 minutes : l’envoi est arrêté. Réessaie quand le réseau est revenu.';
    case 'network':
    case 'not_found':
      return 'Impossible de joindre le serveur. Vérifie ta connexion et réessaie.';
  }
};

// A send also waits for a connection that is only gone for now. These three need someone to do something first.
export const canSendIn = (party: PartyView | null): boolean =>
  party !== null && party.connection !== 'replaced' && party.connection !== 'party_full' && party.connection !== 'update_required';

export const mediaErrorMessage = (error: ActionError): string =>
  error === 'invalid_request' ? 'Ce média n’a pas pu être envoyé. Vérifie le fichier et réessaie.' : errorMessage(error);

export const replayErrorMessage = (error: ActionError): string =>
  error === 'not_found' ? 'Ce média n’est plus disponible : tout est effacé après 1 jour.' : errorMessage(error);

export const pickErrorMessage = (error: Exclude<Extract<PickResult, { ok: false }>['error'], 'cancelled'>): string => {
  switch (error) {
    case 'too_large':
      return 'Ce fichier dépasse 500 Mo.';
    case 'empty':
      return 'Ce fichier est vide.';
    case 'unsupported':
      return 'Ce type de fichier n’est pas pris en charge.';
  }
};
