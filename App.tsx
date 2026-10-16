import React, { useState } from 'react';
import {
  Alert,
  Image,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import BluetoothClassic, {
  type BluetoothDevice,
} from 'react-native-bluetooth-classic';
import { launchImageLibrary } from 'react-native-image-picker';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { buildPrintJob, buildPrintJobEscStar } from './src/escpos';
import type { Mono } from './src/imageToMono';
import {
  testEscStar,
  testGsStarGsSlash,
  testGsV0,
  testGsV0Slow,
  testSquare,
  testText,
} from './src/printTests';
import { imageToMono } from './src/imageToMono';
import { waitAfterConnect, writePrintJob } from './src/printer';

const MIN_THRESHOLD = 100;
const MAX_THRESHOLD = 200;
const THRESHOLD_STEP = 10;

type Status = 'idle' | 'searching' | 'connecting' | 'connected' | 'printing' | 'error';
type PrintMode = 'gs-v-0' | 'esc-star';
type PrinterTest = (device: BluetoothDevice) => Promise<void>;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
}

async function requestBluetoothPermissions(): Promise<void> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 31) {
    return;
  }

  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
  );

  if (result !== PermissionsAndroid.RESULTS.GRANTED) {
    throw new Error('Se necesita permiso para conectarse a dispositivos Bluetooth.');
  }
}

function AppContent() {
  const safeAreaInsets = useSafeAreaInsets();
  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<BluetoothDevice | null>(null);
  const [selectedImage, setSelectedImage] = useState<{ uri: string; width: number; height: number } | null>(null);
  const [printMode, setPrintMode] = useState<PrintMode>('esc-star');
  const [threshold, setThreshold] = useState(160);
  const [status, setStatus] = useState<Status>('idle');
  const [statusMessage, setStatusMessage] = useState('Listo para imprimir.');
  const [busy, setBusy] = useState(false);

  const showError = (error: unknown) => {
    const message = getErrorMessage(error);
    setStatus('error');
    setStatusMessage(message);
    Alert.alert('Error', message);
  };

  const searchPairedDevices = async () => {
    setBusy(true);
    setStatus('searching');
    setStatusMessage('Buscando dispositivos emparejados...');

    try {
      await requestBluetoothPermissions();
      const isAvailable = await BluetoothClassic.isBluetoothAvailable();
      if (!isAvailable) {
        throw new Error('Este dispositivo no tiene Bluetooth disponible.');
      }

      const isEnabled = await BluetoothClassic.isBluetoothEnabled();
      if (!isEnabled) {
        throw new Error('Activa Bluetooth para buscar dispositivos emparejados.');
      }

      const pairedDevices = await BluetoothClassic.getBondedDevices();
      setDevices(pairedDevices);
      setStatus('idle');
      setStatusMessage(
        pairedDevices.length > 0
          ? `Se encontraron ${pairedDevices.length} dispositivo(s) emparejado(s).`
          : 'No se encontraron dispositivos emparejados.',
      );
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  };

  const toggleDeviceConnection = async (device: BluetoothDevice) => {
    if (busy) {
      return;
    }

    setBusy(true);
    setStatus('connecting');
    setStatusMessage(`Conectando con ${device.name || device.address}...`);

    try {
      if (connectedDevice?.address === device.address) {
        await BluetoothClassic.disconnectFromDevice(device.address);
        setConnectedDevice(null);
        setStatus('idle');
        setStatusMessage('Dispositivo desconectado.');
        return;
      }

      if (connectedDevice) {
        await BluetoothClassic.disconnectFromDevice(connectedDevice.address);
        setConnectedDevice(null);
      }

      const connection = await BluetoothClassic.connectToDevice(device.address);
      await waitAfterConnect();
      setConnectedDevice(connection);
      setStatus('connected');
      setStatusMessage(`Conectado a ${connection.name || connection.address}.`);
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  };

  const selectImage = async () => {
    setBusy(true);

    try {
      const response = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
      });

      if (response.didCancel) {
        return;
      }
      if (response.errorCode) {
        throw new Error(response.errorMessage || 'No se pudo seleccionar la imagen.');
      }

      const asset = response.assets?.[0];
      if (!asset?.uri || !asset.width || !asset.height) {
        throw new Error('La imagen seleccionada no contiene dimensiones válidas.');
      }

      setSelectedImage({
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
      });
      setStatus('idle');
      setStatusMessage('Imagen seleccionada. Ya puedes imprimirla.');
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  };

  const printImage = async () => {
    if (!connectedDevice) {
      showError(new Error('Conecta una impresora Bluetooth antes de imprimir.'));
      return;
    }
    if (!selectedImage) {
      showError(new Error('Selecciona una imagen antes de imprimir.'));
      return;
    }
    if (busy) {
      return;
    }

    setBusy(true);
    setStatus('printing');
    setStatusMessage('Preparando imagen para imprimir...');

    try {
      const mono: Mono = await imageToMono(
        selectedImage.uri,
        false,
        threshold,
      );
      const blackCount = mono.blackCount ?? 0;
      const blackPercentage = (100 * blackCount) / (mono.width * mono.height);
      Alert.alert(
        'Diagnóstico de imagen',
        `Ancho: ${mono.width} px\nAlto: ${mono.height} px\nNegros: ${blackCount} (${blackPercentage.toFixed(1)}%)\nGris min: ${mono.grayMin?.toFixed(0)} / max: ${mono.grayMax?.toFixed(0)}`,
      );
      const printChunks =
        printMode === 'esc-star'
          ? buildPrintJobEscStar(mono)
          : buildPrintJob(mono);
      await writePrintJob(connectedDevice, printChunks, (chunkIndex, chunkCount) => {
        setStatusMessage(`Imprimiendo... ${chunkIndex}/${chunkCount}`);
      });

      setStatus('connected');
      setStatusMessage(`Imagen enviada a ${connectedDevice.name || connectedDevice.address}.`);
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  };

  const runPrinterTest = async (printerTest: PrinterTest, testName: string) => {
    if (!connectedDevice) {
      showError(new Error('Conecta una impresora Bluetooth antes de ejecutar una prueba.'));
      return;
    }
    if (busy) {
      return;
    }

    setBusy(true);
    setStatus('printing');
    setStatusMessage(`Ejecutando ${testName}...`);

    try {
      await printerTest(connectedDevice);
      setStatus('connected');
      setStatusMessage(`${testName} enviada a ${connectedDevice.name || connectedDevice.address}.`);
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.safeArea, { paddingTop: safeAreaInsets.top }]}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Impresión térmica</Text>
        <Text style={styles.subtitle}>Conecta una impresora Bluetooth y elige una imagen.</Text>

        <View
          accessibilityLiveRegion="polite"
          style={[
            styles.statusBox,
            status === 'error' ? styles.errorStatus : null,
            status === 'connected' ? styles.connectedStatus : null,
            status === 'printing' ? styles.printingStatus : null,
          ]}>
          <Text style={styles.statusLabel}>
            {status === 'connected'
              ? 'Conectado'
              : status === 'printing'
                ? 'Imprimiendo'
                : status === 'error'
                  ? 'Error'
                  : status === 'connecting'
                    ? 'Conectando'
                    : status === 'searching'
                      ? 'Buscando'
                      : 'Estado'}
          </Text>
          <Text style={styles.statusText}>{statusMessage}</Text>
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          disabled={busy}
          onPress={searchPairedDevices}
          style={[styles.button, busy ? styles.disabledButton : null]}>
          <Text style={styles.buttonText}>Buscar dispositivos emparejados</Text>
        </TouchableOpacity>

        {devices.length > 0 ? (
          <View style={styles.deviceList}>
            <Text style={styles.sectionTitle}>Dispositivos disponibles</Text>
            {devices.map(device => {
              const isSelected = connectedDevice?.address === device.address;

              return (
                <TouchableOpacity
                  key={device.address}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected, disabled: busy }}
                  disabled={busy}
                  onPress={() => toggleDeviceConnection(device)}
                  style={[styles.deviceButton, isSelected ? styles.selectedDevice : null]}>
                  <View style={styles.deviceDetails}>
                    <Text style={styles.deviceName}>{device.name || 'Dispositivo Bluetooth'}</Text>
                    <Text style={styles.deviceAddress}>{device.address}</Text>
                  </View>
                  <Text style={styles.deviceSelection}>
                    {isSelected ? 'Conectado' : 'Seleccionar'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}

        <TouchableOpacity
          accessibilityRole="button"
          disabled={busy}
          onPress={selectImage}
          style={[styles.button, styles.secondaryButton, busy ? styles.disabledButton : null]}>
          <Text style={styles.buttonText}>Seleccionar imagen</Text>
        </TouchableOpacity>

        <View style={styles.printModeSection}>
          <Text style={styles.sectionTitle}>Modo de impresión</Text>
          {([
            ['gs-v-0', 'Modo GS v 0'],
            ['esc-star', 'Modo ESC *'],
          ] as const).map(([mode, label]) => {
            const isSelected = printMode === mode;

            return (
              <TouchableOpacity
                key={mode}
                testID={`print-mode-${mode}`}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected, disabled: busy }}
                disabled={busy}
                onPress={() => setPrintMode(mode)}
                style={[
                  styles.modeButton,
                  isSelected ? styles.selectedModeButton : null,
                  busy ? styles.disabledButton : null,
                ]}>
                <Text style={[styles.modeButtonText, isSelected ? styles.selectedModeButtonText : null]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.thresholdSection}>
          <Text style={styles.sectionTitle}>Umbral</Text>
          <View style={styles.thresholdControls}>
            <TouchableOpacity
              testID="threshold-decrease"
              accessibilityRole="button"
              accessibilityLabel="Reducir umbral"
              accessibilityState={{ disabled: busy || threshold <= MIN_THRESHOLD }}
              disabled={busy || threshold <= MIN_THRESHOLD}
              onPress={() =>
                setThreshold(value => Math.max(MIN_THRESHOLD, value - THRESHOLD_STEP))
              }
              style={[
                styles.thresholdButton,
                (busy || threshold <= MIN_THRESHOLD) ? styles.disabledButton : null,
              ]}>
              <Text style={styles.thresholdButtonText}>−</Text>
            </TouchableOpacity>
            <Text
              testID="threshold-value"
              accessibilityLiveRegion="polite"
              style={styles.thresholdValue}>
              {threshold}
            </Text>
            <TouchableOpacity
              testID="threshold-increase"
              accessibilityRole="button"
              accessibilityLabel="Aumentar umbral"
              accessibilityState={{ disabled: busy || threshold >= MAX_THRESHOLD }}
              disabled={busy || threshold >= MAX_THRESHOLD}
              onPress={() =>
                setThreshold(value => Math.min(MAX_THRESHOLD, value + THRESHOLD_STEP))
              }
              style={[
                styles.thresholdButton,
                (busy || threshold >= MAX_THRESHOLD) ? styles.disabledButton : null,
              ]}>
              <Text style={styles.thresholdButtonText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {selectedImage ? (
          <View style={styles.imageCard}>
            <Image
              accessibilityLabel="Vista previa de la imagen seleccionada"
              resizeMode="contain"
              source={{ uri: selectedImage.uri }}
              style={styles.preview}
            />
            <Text style={styles.imageDetails}>
              Imagen seleccionada ({selectedImage.width} × {selectedImage.height})
            </Text>
          </View>
        ) : (
          <Text style={styles.hint}>Aún no has seleccionado una imagen.</Text>
        )}

        <TouchableOpacity
          accessibilityRole="button"
          disabled={busy}
          onPress={printImage}
          style={[styles.button, styles.printButton, busy ? styles.disabledButton : null]}>
          <Text style={styles.buttonText}>Imprimir imagen</Text>
        </TouchableOpacity>

        <View style={styles.printTestsSection}>
          <Text style={styles.sectionTitle}>Pruebas</Text>
          <TouchableOpacity
            accessibilityRole="button"
            disabled={busy}
            onPress={() => runPrinterTest(testSquare, 'Test cuadrado')}
            style={[styles.testButton, busy ? styles.disabledButton : null]}>
            <Text style={styles.buttonText}>Test cuadrado</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            disabled={busy}
            onPress={() => runPrinterTest(testText, 'Test texto')}
            style={[styles.testButton, busy ? styles.disabledButton : null]}>
            <Text style={styles.buttonText}>Test texto</Text>
          </TouchableOpacity>
          {([
            ['testText', testText],
            ['testGsV0', testGsV0],
            ['testEscStar', testEscStar],
            ['testGsV0Slow', testGsV0Slow],
            ['testGsStarGsSlash', testGsStarGsSlash],
          ] as const).map(([testName, printerTest]) => (
            <TouchableOpacity
              key={testName}
              accessibilityRole="button"
              disabled={busy}
              onPress={() => runPrinterTest(printerTest, testName)}
              style={[styles.testButton, busy ? styles.disabledButton : null]}>
              <Text style={styles.buttonText}>{testName}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f4f6f8',
  },
  container: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 32,
  },
  title: {
    color: '#17212b',
    fontSize: 27,
    fontWeight: '700',
    marginBottom: 6,
  },
  subtitle: {
    color: '#526170',
    fontSize: 15,
    marginBottom: 20,
  },
  statusBox: {
    backgroundColor: '#e8edf2',
    borderRadius: 10,
    marginBottom: 16,
    padding: 14,
  },
  connectedStatus: {
    backgroundColor: '#e4f5e9',
  },
  printingStatus: {
    backgroundColor: '#fff3d9',
  },
  errorStatus: {
    backgroundColor: '#fde8e7',
  },
  statusLabel: {
    color: '#17212b',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 3,
  },
  statusText: {
    color: '#344250',
    fontSize: 14,
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#2457a7',
    borderRadius: 9,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 16,
    marginTop: 10,
  },
  secondaryButton: {
    backgroundColor: '#40566f',
    marginTop: 22,
  },
  printModeSection: {
    marginTop: 22,
  },
  thresholdSection: {
    marginTop: 18,
  },
  thresholdControls: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 8,
  },
  thresholdButton: {
    alignItems: 'center',
    backgroundColor: '#40566f',
    borderRadius: 9,
    justifyContent: 'center',
    minHeight: 46,
    minWidth: 64,
  },
  thresholdButtonText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '700',
  },
  thresholdValue: {
    color: '#17212b',
    fontSize: 18,
    fontWeight: '700',
    minWidth: 64,
    textAlign: 'center',
  },
  modeButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#d7dee5',
    borderRadius: 9,
    borderWidth: 1,
    justifyContent: 'center',
    marginBottom: 8,
    minHeight: 46,
    paddingHorizontal: 16,
  },
  selectedModeButton: {
    backgroundColor: '#e8f0fb',
    borderColor: '#2457a7',
  },
  modeButtonText: {
    color: '#344250',
    fontSize: 14,
    fontWeight: '600',
  },
  selectedModeButtonText: {
    color: '#2457a7',
    fontWeight: '700',
  },
  printButton: {
    backgroundColor: '#167344',
    marginTop: 18,
  },
  printTestsSection: {
    marginTop: 24,
  },
  testButton: {
    alignItems: 'center',
    backgroundColor: '#40566f',
    borderRadius: 9,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  disabledButton: {
    opacity: 0.55,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  deviceList: {
    marginTop: 18,
  },
  sectionTitle: {
    color: '#17212b',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
  },
  deviceButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#d7dee5',
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    minHeight: 60,
    padding: 12,
  },
  selectedDevice: {
    borderColor: '#167344',
    borderWidth: 2,
  },
  deviceDetails: {
    flex: 1,
    marginRight: 10,
  },
  deviceName: {
    color: '#17212b',
    fontSize: 15,
    fontWeight: '600',
  },
  deviceAddress: {
    color: '#667584',
    fontSize: 12,
    marginTop: 3,
  },
  deviceSelection: {
    color: '#2457a7',
    fontSize: 12,
    fontWeight: '700',
  },
  imageCard: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 9,
    marginTop: 14,
    padding: 12,
  },
  preview: {
    height: 220,
    width: '100%',
  },
  imageDetails: {
    color: '#526170',
    fontSize: 13,
    marginTop: 8,
  },
  hint: {
    color: '#667584',
    fontSize: 14,
    marginTop: 14,
    textAlign: 'center',
  },
});

export default App;
