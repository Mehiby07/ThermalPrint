import { Buffer } from 'buffer';
import { writePrintJob } from '../src/printer';

test('writePrintJob sends Buffer chunks to the Bluetooth device', async () => {
  const write = jest.fn().mockResolvedValue(true);
  const onProgress = jest.fn();

  await writePrintJob({ write }, [Uint8Array.from([0x1b, 0x40])], onProgress);

  expect(write).toHaveBeenCalledTimes(1);
  expect(Buffer.isBuffer(write.mock.calls[0][0])).toBe(true);
  expect(Array.from(write.mock.calls[0][0])).toEqual([0x1b, 0x40]);
  expect(onProgress).toHaveBeenCalledWith(1, 1);
});
