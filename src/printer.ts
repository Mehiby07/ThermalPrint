import { Buffer } from 'buffer';
import type { BluetoothDevice } from 'react-native-bluetooth-classic';

const WRITE_CHUNK_SIZE = 1024;

export function sleep(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

export async function waitAfterConnect(): Promise<void> {
  await sleep(800);
}

export async function sendToPrinter(
  device: Pick<BluetoothDevice, 'write'>,
  data: Uint8Array,
): Promise<void> {
  const success = await device.write(Buffer.from(data));
  if (!success) {
    throw new Error('La impresora no aceptó los datos enviados.');
  }
}

export async function writePrintJob(
  device: Pick<BluetoothDevice, 'write'>,
  chunks: Uint8Array[],
  onProgress: (chunkIndex: number, chunkCount: number) => void,
): Promise<void> {
  const printData = Buffer.concat(chunks.map(chunk => Buffer.from(chunk)));
  const chunkCount = Math.ceil(printData.length / WRITE_CHUNK_SIZE);

  for (
    let offset = 0, chunkIndex = 0;
    offset < printData.length;
    offset += WRITE_CHUNK_SIZE
  ) {
    const chunk = Buffer.from(printData.subarray(offset, offset + WRITE_CHUNK_SIZE));
    await sendToPrinter(device, chunk);

    chunkIndex += 1;
    onProgress(chunkIndex, chunkCount);
  }
}
