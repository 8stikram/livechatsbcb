import { useState } from 'react';

// The picture from Discord or, while there is none or if it can't load, the first letter of the name.
export const Avatar = ({
  name,
  url,
  className,
  testId,
}: {
  name: string;
  url: string | null;
  className: string;
  testId?: string;
}) => {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  return url && url !== failedUrl ? (
    <img className={className} src={url} alt="" draggable={false} onError={() => setFailedUrl(url)} data-testid={testId} />
  ) : (
    <span className={className} aria-hidden="true" data-testid={testId}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
};
