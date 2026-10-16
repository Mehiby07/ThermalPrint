import ImageResizer from '@bam.tech/react-native-image-resizer';
import RNFS from 'react-native-fs';
import jpeg from 'jpeg-js';
import {Buffer} from 'buffer';

export const PRINTER_WIDTH = 384;

export interface Mono {
  width: number;
  height: number;
  data: Uint8Array; // 1 = negro, 0 = blanco
  blackCount?: number;
  grayMin?: number;
  grayMax?: number;
}

export async function imageToMono(
  uri: string,
  dither = false,
  threshold = 160,
): Promise<Mono> {
  // 1) Convertir a JPEG (sin transparencia) con tamaño razonable
  const resized = await ImageResizer.createResizedImage(
    uri, 1200, 4000, 'JPEG', 95, 0, undefined, false,
    {mode: 'contain', onlyScaleDown: true},
  );
  const path = resized.path.startsWith('file://')
    ? resized.path.slice(7)
    : resized.path;

  // 2) Decodificar JPEG a RGBA
  const b64 = await RNFS.readFile(path, 'base64');
  const raw = jpeg.decode(Buffer.from(b64, 'base64'), {
    useTArray: true,
    formatAsRGBA: true,
  });
  const sw = raw.width;
  const sh = raw.height;
  console.log(`decodificada ${sw}x${sh}, bytes=${raw.data.length}`);

  // 3) Escalar a 384 de ancho con promedio por caja y pasar a grises
  const w = PRINTER_WIDTH; // 384 es múltiplo de 8
  const h = Math.max(1, Math.round((sh * w) / sw));
  const gray = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy0 = Math.floor((y * sh) / h);
    const sy1 = Math.min(sh, Math.max(sy0 + 1, Math.ceil(((y + 1) * sh) / h)));
    for (let x = 0; x < w; x++) {
      const sx0 = Math.floor((x * sw) / w);
      const sx1 = Math.min(sw, Math.max(sx0 + 1, Math.ceil(((x + 1) * sw) / w)));
      let sum = 0;
      let n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const i = (sy * sw + sx) * 4;
          sum += 0.299 * raw.data[i] + 0.587 * raw.data[i + 1] + 0.114 * raw.data[i + 2];
          n++;
        }
      }
      gray[y * w + x] = sum / n;
    }
  }

  let grayMin = 255;
  let grayMax = 0;
  for (let i = 0; i < gray.length; i++) {
    if (gray[i] < grayMin) grayMin = gray[i];
    if (gray[i] > grayMax) grayMax = gray[i];
  }

  // 4) Umbral o Floyd-Steinberg
  const out = new Uint8Array(w * h);
  let blackCount = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const old = gray[idx];
      const nw = old < threshold ? 0 : 255;
      if (nw === 0) {
        out[idx] = 1;
        blackCount++;
      }
      if (dither) {
        const err = old - nw;
        if (x + 1 < w) gray[idx + 1] += (err * 7) / 16;
        if (y + 1 < h) {
          if (x > 0) gray[idx + w - 1] += (err * 3) / 16;
          gray[idx + w] += (err * 5) / 16;
          if (x + 1 < w) gray[idx + w + 1] += (err * 1) / 16;
        }
      }
    }
  }
  console.log(`mono ${w}x${h} negros=${blackCount} gris=${grayMin.toFixed(0)}-${grayMax.toFixed(0)}`);
  return {width: w, height: h, data: out, blackCount, grayMin, grayMax};
}
