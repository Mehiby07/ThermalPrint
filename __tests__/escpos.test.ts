import { buildPrintJob, buildPrintJobEscStar, type Mono } from '../src/escpos';

test('buildPrintJob encodes monochrome pixels as GS v 0 raster data', () => {
  const mono: Mono = {
    width: 2,
    height: 2,
    data: Uint8Array.from([1, 0, 0, 1]),
  };

  const chunks = buildPrintJob(mono);

  expect(chunks.map(chunk => Array.from(chunk))).toEqual([
    [0x1b, 0x40],
    [0x1d, 0x76, 0x30, 0x00, 1, 0, 2, 0],
    [0x80, 0x40],
  ]);
});

test('buildPrintJobEscStar encodes 24-dot strips and feeds paper', () => {
  const mono: Mono = {
    width: 1,
    height: 1,
    data: Uint8Array.from([1]),
  };

  const chunks = buildPrintJobEscStar(mono);

  expect(chunks.map(chunk => Array.from(chunk))).toEqual([
    [0x1b, 0x40],
    [0x1b, 0x33, 24],
    [0x1b, 0x2a, 33, 1, 0, 0x80, 0, 0],
    [0x0a],
    [0x1b, 0x32],
    [0x1b, 0x64, 4],
  ]);
});
