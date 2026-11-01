import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pngToIco from 'png-to-ico';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'assets/logo-source.webp');
const buildDir = resolve(root, 'apps/desktop/build');
const assetsDir = resolve(root, 'apps/desktop/src/renderer/src/assets');

const metadata = await sharp(source).metadata();
const scale = metadata.width / 1254;

// Around the camera only: the SBCB letters turn to noise below 64 px.
const cameraCrop = {
  left: Math.round(170 * scale),
  top: Math.round(205 * scale),
  width: Math.round(915 * scale),
  height: Math.round(915 * scale),
};

const fullLogo = (size) => sharp(source).resize(size, size, { kernel: 'lanczos3' }).png().toBuffer();
const cameraOnly = (size) =>
  sharp(source).extract(cameraCrop).resize(size, size, { kernel: 'lanczos3' }).sharpen().png().toBuffer();

const iconLayers = await Promise.all([
  cameraOnly(16),
  cameraOnly(24),
  cameraOnly(32),
  cameraOnly(48),
  fullLogo(64),
  fullLogo(128),
  fullLogo(256),
]);

mkdirSync(buildDir, { recursive: true });
mkdirSync(assetsDir, { recursive: true });
writeFileSync(resolve(buildDir, 'icon.ico'), await pngToIco(iconLayers));
writeFileSync(resolve(assetsDir, 'logo.png'), await fullLogo(512));
console.log(`Icons generated from a ${metadata.width}x${metadata.height} source.`);
