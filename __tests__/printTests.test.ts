import type { BluetoothDevice } from 'react-native-bluetooth-classic';
import {
  testEscStar,
  testGsStarGsSlash,
  testGsV0,
  testGsV0Slow,
  testSquare,
  testText,
} from '../src/printTests';
import { sendToPrinter, sleep } from '../src/printer';

jest.mock('../src/printer', () => ({
  sendToPrinter: jest.fn(() => Promise.resolve()),
  sleep: jest.fn(() => Promise.resolve()),
}));

const device = {} as BluetoothDevice;
const mockSendToPrinter = jest.mocked(sendToPrinter);
const mockSleep = jest.mocked(sleep);

beforeEach(() => {
  mockSendToPrinter.mockClear();
  mockSleep.mockClear();
});

test('testText sends init, ASCII text, and feed as separate writes', async () => {
  await testText(device);

  expect(mockSendToPrinter.mock.calls.map(([, bytes]) => Array.from(bytes))).toEqual([
    [0x1b, 0x40],
    [0x48, 0x4f, 0x4c, 0x41, 0x20, 0x4d, 0x55, 0x4e, 0x44, 0x4f, 0x0a, 0x0a, 0x0a],
    [0x1b, 0x64, 0x03],
  ]);
  expect(mockSleep.mock.calls).toEqual([[150], [150]]);
});

test('testSquare sends a 384 by 64 black raster and feeds four lines', async () => {
  await testSquare(device);

  const block = mockSendToPrinter.mock.calls[1][1];
  expect(Array.from(block.subarray(0, 8))).toEqual([
    0x1d, 0x76, 0x30, 0x00, 0x30, 0x00, 0x40, 0x00,
  ]);
  expect(block).toHaveLength(8 + 48 * 64);
  expect(Array.from(block.subarray(8)).every(byte => byte === 0xff)).toBe(true);
  expect(mockSendToPrinter.mock.calls.map(([, bytes]) => Array.from(bytes))[2]).toEqual([
    0x1b, 0x64, 0x04,
  ]);
  expect(mockSleep.mock.calls).toEqual([[300], [300]]);
});

test('testGsV0 sends the specified 48 by 48 raster in one block', async () => {
  await testGsV0(device);

  const block = mockSendToPrinter.mock.calls[1][1];
  expect(Array.from(block.subarray(0, 8))).toEqual([
    0x1d, 0x76, 0x30, 0x00, 0x30, 0x00, 0x30, 0x00,
  ]);
  expect(block).toHaveLength(8 + 48 * 48);
  expect(Array.from(block.subarray(8)).every(byte => byte === 0xff)).toBe(true);
  expect(mockSleep.mock.calls).toEqual([[300], [300]]);
});

test('testEscStar sends two 24-dot strips with the requested bytes', async () => {
  await testEscStar(device);

  for (const [, strip] of [mockSendToPrinter.mock.calls[2], mockSendToPrinter.mock.calls[3]]) {
    expect(strip).toHaveLength(5 + 384 * 3 + 1);
    expect(Array.from(strip.subarray(0, 5))).toEqual([0x1b, 0x2a, 0x21, 0x80, 0x01]);
    expect(Array.from(strip.subarray(5, -1)).every(byte => byte === 0xff)).toBe(true);
    expect(strip[strip.length - 1]).toBe(0x0a);
  }
  expect(mockSleep.mock.calls).toEqual([[300]]);
});

test('testGsV0Slow sends the raster in 64-byte chunks with delays between them', async () => {
  await testGsV0Slow(device);

  const rasterChunks = mockSendToPrinter.mock.calls.slice(1, -1).map(([, bytes]) => bytes);
  expect(rasterChunks.map(chunk => chunk.length)).toEqual([
    ...Array<number>(36).fill(64),
    8,
  ]);
  const block = Uint8Array.from(rasterChunks.flatMap(chunk => Array.from(chunk)));
  expect(Array.from(block.subarray(0, 8))).toEqual([
    0x1d, 0x76, 0x30, 0x00, 0x30, 0x00, 0x30, 0x00,
  ]);
  expect(Array.from(block.subarray(8)).every(byte => byte === 0xff)).toBe(true);
  expect(mockSleep.mock.calls.filter(([milliseconds]) => milliseconds === 40)).toHaveLength(36);
  expect(mockSleep.mock.calls.filter(([milliseconds]) => milliseconds === 300)).toHaveLength(2);
});

test('testGsStarGsSlash stores and prints the 48-byte by 48-dot image', async () => {
  await testGsStarGsSlash(device);

  const storedImage = mockSendToPrinter.mock.calls[0][1];
  expect(Array.from(storedImage.subarray(0, 4))).toEqual([0x1d, 0x2a, 0x30, 0x06]);
  expect(storedImage).toHaveLength(4 + 48 * 6);
  expect(Array.from(storedImage.subarray(4)).every(byte => byte === 0xff)).toBe(true);
  expect(mockSendToPrinter.mock.calls.slice(1).map(([, bytes]) => Array.from(bytes))).toEqual([
    [0x1d, 0x2f, 0x00],
    [0x1b, 0x64, 0x03],
  ]);
});
