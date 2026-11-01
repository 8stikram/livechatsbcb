import type { UpdateStatus } from '../../../shared/ipc';

export const UpdateBanner = ({ update }: { update: UpdateStatus }) => {
  if (update.state === 'downloading') {
    return (
      <p className="banner" role="status" data-testid="update-progress">
        Téléchargement de la version {update.version} : <span className="mono">{update.percent} %</span>
      </p>
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
