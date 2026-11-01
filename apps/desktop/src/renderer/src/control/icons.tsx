import type { ReactNode } from 'react';
import type { MediaKind } from '@livechatsbcb/protocol';

const Stroke = ({ size = 20, children }: { size?: number; children: ReactNode }) => (
  <svg
    aria-hidden="true"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
);

type IconProps = { size?: number };

export const IconPlus = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M12 5v14M5 12h14" />
  </Stroke>
);

export const IconClose = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Stroke>
);

export const IconCheck = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Stroke>
);

export const IconSliders = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </Stroke>
);

export const IconLock = (props: IconProps) => (
  <Stroke {...props}>
    <rect x="5" y="11" width="14" height="9" rx="2.5" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Stroke>
);

export const IconSound = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M4 10v4h3l5 4V6L7 10H4zM16 9.5a4 4 0 0 1 0 5M18.5 7a7.5 7.5 0 0 1 0 10" />
  </Stroke>
);

export const IconMuted = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M4 10v4h3l5 4V6L7 10H4zM16.5 9.5l4 5M20.5 9.5l-4 5" />
  </Stroke>
);

export const IconSkip = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M6 5l10 7-10 7V5zM19 5v14" />
  </Stroke>
);

export const IconPlay = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M7 5l12 7-12 7V5z" />
  </Stroke>
);

export const IconStar = (props: IconProps) => (
  <Stroke {...props}>
    <path d="m12 4 2.5 5.1 5.6.8-4 4 .9 5.6-5-2.7-5 2.7.9-5.6-4-4 5.6-.8z" />
  </Stroke>
);

export const IconSend = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Stroke>
);

export const IconCopy = (props: IconProps) => (
  <Stroke {...props}>
    <rect x="9" y="9" width="11" height="11" rx="2.5" />
    <path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15" />
  </Stroke>
);

const IconImage = (props: IconProps) => (
  <Stroke {...props}>
    <rect x="3.5" y="5" width="17" height="14" rx="3" />
    <circle cx="9" cy="10" r="1.5" />
    <path d="M4 17l5-4.5 3.5 3 3-2.5 4.5 4" />
  </Stroke>
);

const IconVideo = (props: IconProps) => (
  <Stroke {...props}>
    <rect x="3.5" y="6" width="12.5" height="12" rx="3" />
    <path d="M16 10.5l4.5-2.5v8L16 13.5" />
  </Stroke>
);

const IconMusic = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M9 18V6l10-2v12" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="16.5" cy="16" r="2.5" />
  </Stroke>
);

const IconText = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M5 7V5h14v2M12 5v14M9 19h6" />
  </Stroke>
);

const KIND_ICONS = { image: IconImage, video: IconVideo, audio: IconMusic, text: IconText };

export const KindIcon = ({ kind, size }: IconProps & { kind: MediaKind }) => {
  const Icon = KIND_ICONS[kind];
  return <Icon size={size} />;
};

export const IconDiscord = ({ size = 20 }: IconProps) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
  </svg>
);
