import type { UpdateStatus } from '../../../shared/ipc';

export const UpdateBanner = ({ update, restartIn, failed = false }: { update: UpdateStatus; restartIn: number | null; failed?: boolean }) => {
  if (update.state === 'downloading') {
    return (
      <div className="banner is-downloading" role="status" data-testid="update-progress">
        <span>Téléchargement de la version {update.version}</span>
        <progress max={100} value={update.percent} aria-label="Téléchargement de la mise à jour" />
        <span className="mono">{update.percent} %</span>
      </div>
    );
  }

  if (update.state === 'manual') {
    return (
      <p className="banner" role="status" data-testid="update-manual">
        <span>Version {update.version} disponible : mets l’app dans Applications pour la recevoir toute seule</span>
      </p>
    );
  }

  if (update.state === 'ready') {
    return (
      <p className="banner" role="status" data-testid="update-ready">
        {restartIn !== null ? (
          <span>
            Version {update.version} : l’app redémarre dans <span className="mono">{restartIn}</span> s
          </span>
        ) : failed ? (
          <>
            <span>La version {update.version} n’a pas pu s’installer.</span>
            <button type="button" className="pill primary small" onClick={() => void window.liveChat.installUpdate()}>
              Réessayer
            </button>
          </>
        ) : (
          <span>Version {update.version} prête : l’app redémarrera dès que plus rien ne passe</span>
        )}
      </p>
    );
  }

  return null;
};
