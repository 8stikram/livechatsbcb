const MAX_SPOKEN_LENGTH = 200;
const READING_LEAD_MS = 1_000;
const READING_MS_PER_CHARACTER = 85;

// Emojis are for the eyes: a voice would read out their long names.
export const spokenText = (caption: string): string =>
  caption
    .replace(/\p{Extended_Pictographic}|\u200d|\ufe0f/gu, '')
    .trim()
    .slice(0, MAX_SPOKEN_LENGTH);

export const isLongerThanSpoken = (caption: string): boolean => caption.trim().length > MAX_SPOKEN_LENGTH;

export const readingMs = (caption: string): number => READING_LEAD_MS + spokenText(caption).length * READING_MS_PER_CHARACTER;

export const say = (text: string, voiceUri: string | null, ratePercent: number, volume: number): void => {
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = speechSynthesis.getVoices();
  const voice = voices.find(({ voiceURI }) => voiceURI === voiceUri) ?? voices.find(({ default: isDefault }) => isDefault);
  if (voice) utterance.voice = voice;
  utterance.rate = ratePercent / 100;
  utterance.volume = volume;
  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
};
