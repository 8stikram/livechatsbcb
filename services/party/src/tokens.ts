export const toHex = (bytes: Uint8Array): string =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');

export const randomToken = (): string => toHex(crypto.getRandomValues(new Uint8Array(32)));

const digest = async (value: string): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));

export const sha256 = async (value: string): Promise<string> => toHex(await digest(value));

export const sha256Base64Url = async (value: string): Promise<string> =>
  btoa(String.fromCharCode(...(await digest(value))))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
