import type { UpdateStatus } from '../../../shared/ipc';

export const UpdateBanner = ({ update }: { update: UpdateStatus }) => {
  if (update.state === 'downloading') {
    return (
      <p className="update-banner" role="status" data-testid="update-progress">
        Téléchargement de la version {update.version} : {update.percent} %
      </p>
    );
  }

  if (update.state === 'ready') {
    return (
      <div className="update-banner is-ready" role="status">
        <span>Version {update.version} prête</span>
        <button type="button" className="primary compact" onClick={() => void window.liveChat.installUpdate()}>
          Redémarrer
        </button>
      </div>
    );
  }

  return null;
};
