export type Mono = {
  width: number;
  height: number;
  data: Uint8Array;
  blackCount?: number;
};

export function buildPrintJob(mono: Mono): Uint8Array[] {
  const { width, height, data } = mono;
  const rowBytes = Math.ceil(width / 8);
  const raster = new Uint8Array(rowBytes * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[y * width + x] !== 0) {
        raster[y * rowBytes + Math.floor(x / 8)] |= 1 << (7 - (x % 8));
      }
    }
  }

  return [
    Uint8Array.from([0x1b, 0x40]),
    Uint8Array.from([
      0x1d,
      0x76,
      0x30,
      0x00,
      rowBytes & 0xff,
      (rowBytes >> 8) & 0xff,
      height & 0xff,
      (height >> 8) & 0xff,
    ]),
    raster,
  ];
}

export function buildPrintJobEscStar(mono: Mono, feedLines = 4): Uint8Array[] {
  const {width, height, data} = mono;
  const chunks: Uint8Array[] = [
    Uint8Array.from([0x1b, 0x40]),       // ESC @ init
    Uint8Array.from([0x1b, 0x33, 24]),   // ESC 3 24: interlineado = 24 puntos
  ];
  for (let y0 = 0; y0 < height; y0 += 24) {
    const strip = new Uint8Array(5 + width * 3);
    strip.set([0x1b, 0x2a, 33, width & 0xff, (width >> 8) & 0xff], 0); // ESC * 33 nL nH
    let p = 5;
    for (let x = 0; x < width; x++) {
      for (let k = 0; k < 3; k++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const y = y0 + k * 8 + bit;
          byte = (byte << 1) | (y < height ? data[y * width + x] : 0);
        }
        strip[p++] = byte;
      }
    }
    chunks.push(strip, Uint8Array.from([0x0a])); // LF
  }
  chunks.push(Uint8Array.from([0x1b, 0x32]));           // ESC 2: restaurar interlineado
  chunks.push(Uint8Array.from([0x1b, 0x64, feedLines])); // avanzar papel
  return chunks;
}
