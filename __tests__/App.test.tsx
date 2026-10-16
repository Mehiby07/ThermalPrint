/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('react-native-bluetooth-classic', () => ({
  __esModule: true,
  default: {
    isBluetoothAvailable: jest.fn(),
    isBluetoothEnabled: jest.fn(),
    getBondedDevices: jest.fn(),
    connectToDevice: jest.fn(),
    disconnectFromDevice: jest.fn(),
  },
}));

jest.mock('react-native-image-picker', () => ({
  launchImageLibrary: jest.fn(),
}));

jest.mock('@bam.tech/react-native-image-resizer', () => ({
  __esModule: true,
  default: { createResizedImage: jest.fn() },
}));

jest.mock('react-native-fs', () => ({
  __esModule: true,
  default: { readFile: jest.fn() },
}));

test('renders both print modes and selects ESC * by default', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  const getModeButton = (mode: string) =>
    renderer!.root.findByProps({ testID: `print-mode-${mode}` });

  expect(getModeButton('gs-v-0').props.accessibilityState.selected).toBe(false);
  expect(getModeButton('esc-star').props.accessibilityState.selected).toBe(true);

  await ReactTestRenderer.act(() => {
    getModeButton('gs-v-0').props.onPress();
  });

  expect(getModeButton('gs-v-0').props.accessibilityState.selected).toBe(true);
  expect(getModeButton('esc-star').props.accessibilityState.selected).toBe(false);

  const thresholdValue = () => renderer!.root.findByProps({ testID: 'threshold-value' });
  const decreaseThreshold = () => renderer!.root.findByProps({ testID: 'threshold-decrease' });
  const increaseThreshold = () => renderer!.root.findByProps({ testID: 'threshold-increase' });

  expect(thresholdValue().props.children).toBe(160);

  await ReactTestRenderer.act(() => {
    decreaseThreshold().props.onPress();
  });
  expect(thresholdValue().props.children).toBe(150);

  await ReactTestRenderer.act(() => {
    for (let step = 0; step < 5; step += 1) {
      decreaseThreshold().props.onPress();
    }
  });
  expect(thresholdValue().props.children).toBe(100);
  expect(decreaseThreshold().props.disabled).toBe(true);

  await ReactTestRenderer.act(() => {
    for (let step = 0; step < 10; step += 1) {
      increaseThreshold().props.onPress();
    }
  });
  expect(thresholdValue().props.children).toBe(200);
  expect(increaseThreshold().props.disabled).toBe(true);
});
