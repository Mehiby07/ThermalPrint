import type { BluetoothDevice } from 'react-native-bluetooth-classic';
import { sendToPrinter, sleep } from './printer';

const BLACK_SQUARE_WIDTH = 384;
const BLACK_SQUARE_HEIGHT = 48;
const BLACK_SQUARE_BYTES = BLACK_SQUARE_WIDTH / 8 * BLACK_SQUARE_HEIGHT;
const DIAGNOSTIC_SQUARE_HEIGHT = 64;

function blackSquare(): Uint8Array {
  return new Uint8Array(BLACK_SQUARE_BYTES).fill(0xff);
}

export async function testSquare(device: BluetoothDevice): Promise<void> {
  await sendToPrinter(device, Uint8Array.from([0x1b, 0x40]));
  await sleep(300);

  const image = new Uint8Array(
    (BLACK_SQUARE_WIDTH / 8) * DIAGNOSTIC_SQUARE_HEIGHT,
  ).fill(0xff);
  const block = new Uint8Array(8 + image.length);
  block.set([
    0x1d,
    0x76,
    0x30,
    0x00,
    0x30,
    0x00,
    DIAGNOSTIC_SQUARE_HEIGHT,
    0x00,
  ]);
  block.set(image, 8);
  await sendToPrinter(device, block);

  await sleep(300);
  await sendToPrinter(device, Uint8Array.from([0x1b, 0x64, 0x04]));
}

export async function testText(device: BluetoothDevice): Promise<void> {
  await sendToPrinter(device, Uint8Array.from([0x1b, 0x40]));
  await sleep(150);
  await sendToPrinter(device, Uint8Array.from([
    0x48, 0x4f, 0x4c, 0x41, 0x20, 0x4d, 0x55, 0x4e, 0x44, 0x4f, 0x0a, 0x0a, 0x0a,
  ]));
  await sleep(150);
  await sendToPrinter(device, Uint8Array.from([0x1b, 0x64, 0x03]));
}

export async function testGsV0(device: BluetoothDevice): Promise<void> {
  await sendToPrinter(device, Uint8Array.from([0x1b, 0x40]));
  await sleep(300);

  const image = blackSquare();
  const block = new Uint8Array(8 + image.length);
  block.set([0x1d, 0x76, 0x30, 0x00, 0x30, 0x00, 0x30, 0x00]);
  block.set(image, 8);
  await sendToPrinter(device, block);

  await sleep(300);
  await sendToPrinter(device, Uint8Array.from([0x1b, 0x64, 0x03]));
}

export async function testEscStar(device: BluetoothDevice): Promise<void> {
  await sendToPrinter(device, Uint8Array.from([0x1b, 0x40]));
  await sleep(300);
  await sendToPrinter(device, Uint8Array.from([0x1b, 0x33, 24]));

  for (let stripIndex = 0; stripIndex < 2; stripIndex += 1) {
    const strip = new Uint8Array(5 + BLACK_SQUARE_WIDTH * 3 + 1);
    strip.set([0x1b, 0x2a, 0x21, 0x80, 0x01]);
    strip.fill(0xff, 5, strip.length - 1);
    strip[strip.length - 1] = 0x0a;
    await sendToPrinter(device, strip);
  }

  await sendToPrinter(device, Uint8Array.from([0x1b, 0x32]));
  await sendToPrinter(device, Uint8Array.from([0x1b, 0x64, 0x03]));
}

export async function testGsV0Slow(device: BluetoothDevice): Promise<void> {
  await sendToPrinter(device, Uint8Array.from([0x1b, 0x40]));
  await sleep(300);

  const image = blackSquare();
  const block = new Uint8Array(8 + image.length);
  block.set([0x1d, 0x76, 0x30, 0x00, 0x30, 0x00, 0x30, 0x00]);
  block.set(image, 8);

  for (let offset = 0; offset < block.length; offset += 64) {
    await sendToPrinter(device, block.subarray(offset, offset + 64));
    if (offset + 64 < block.length) {
      await sleep(40);
    }
  }

  await sleep(300);
  await sendToPrinter(device, Uint8Array.from([0x1b, 0x64, 0x03]));
}

export async function testGsStarGsSlash(device: BluetoothDevice): Promise<void> {
  const image = new Uint8Array(BLACK_SQUARE_WIDTH / 8 * 6).fill(0xff);
  const storedImage = new Uint8Array(4 + image.length);
  storedImage.set([0x1d, 0x2a, 0x30, 0x06]);
  storedImage.set(image, 4);
  await sendToPrinter(device, storedImage);
  await sendToPrinter(device, Uint8Array.from([0x1d, 0x2f, 0x00]));
  await sendToPrinter(device, Uint8Array.from([0x1b, 0x64, 0x03]));
}
