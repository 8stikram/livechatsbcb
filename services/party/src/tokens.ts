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

const bytesOf = (text: string): Uint8Array => new TextEncoder().encode(text);

// Comes from the app's Discord secret, which leaves no other secret to look after.
export const sealingKey = async (secret: string): Promise<CryptoKey> => {
  const base = await crypto.subtle.importKey('raw', bytesOf(secret), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: bytesOf('livechatsbcb discord tokens') },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
};

export const seal = async (key: CryptoKey, text: string): Promise<string> => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytesOf(text)));
  return btoa(String.fromCharCode(...iv, ...sealed));
};

// Null when it can't be read, which is what a changed secret looks like.
export const unseal = async (key: CryptoKey, sealed: string): Promise<string | null> => {
  try {
    const bytes = Uint8Array.from(atob(sealed), (character) => character.charCodeAt(0));
    const text = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12));
    return new TextDecoder().decode(text);
  } catch {
    return null;
  }
};
