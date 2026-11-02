import type { UpdateStatus } from '../../../shared/ipc';

export const UpdateBanner = ({ update, restartIn }: { update: UpdateStatus; restartIn: number | null }) => {
  if (update.state === 'downloading') {
    return (
      <div className="banner is-downloading" role="status" data-testid="update-progress">
        <span>Téléchargement de la version {update.version}</span>
        <progress max={100} value={update.percent} aria-label="Téléchargement de la mise à jour" />
        <span className="mono">{update.percent} %</span>
      </div>
    );
  }

  if (update.state === 'ready') {
    return (
      <p className="banner" role="status" data-testid="update-ready">
        {restartIn !== null ? (
          <span>
            Version {update.version} : l’app redémarre dans <span className="mono">{restartIn}</span> s
          </span>
        ) : (
          <span>Version {update.version} prête : l’app redémarrera dès que plus rien ne passe</span>
        )}
      </p>
    );
  }

  return null;
};
