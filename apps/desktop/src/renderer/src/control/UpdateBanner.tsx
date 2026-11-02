import type { UpdateStatus } from '../../../shared/ipc';

export const UpdateBanner = ({ update }: { update: UpdateStatus }) => {
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
      <div className="banner" role="status">
        <span>Version {update.version} prête</span>
        <button type="button" className="pill primary small" onClick={() => void window.liveChat.installUpdate()}>
          Redémarrer
        </button>
      </div>
    );
  }

  return null;
};
