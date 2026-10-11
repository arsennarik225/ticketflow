import { Camera, CameraView, PermissionResponse } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { colors, Notice, textStyles } from '../../components/Screen';

export function QrCamera({ onScan }: { onScan: (payload: string) => void }) {
  const [permission, setPermission] = useState<PermissionResponse | null>(null);
  const [checking, setChecking] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState(false);
  const [ready, setReady] = useState(false);
  const [cameraKey, setCameraKey] = useState(0);
  const mounted = useRef(false);
  const permissionRequest = useRef(0);
  const busy = useRef(false);
  const cameraAttempt = useRef(0);
  const cameraReady = useRef(false);
  const cameraFailed = useRef(false);

  const checkPermission = async (request: boolean) => {
    if (busy.current) return;
    busy.current = true;
    const generation = ++permissionRequest.current;
    setError(null);
    setChecking(!request);
    setRequesting(request);
    try {
      const result = await (request ? Camera.requestCameraPermissionsAsync() : Camera.getCameraPermissionsAsync());
      if (mounted.current && generation === permissionRequest.current) setPermission(result);
    } catch {
      if (mounted.current && generation === permissionRequest.current) setError('Camera permission could not be checked. Please try again.');
    } finally {
      if (mounted.current && generation === permissionRequest.current) {
        busy.current = false;
        setChecking(false);
        setRequesting(false);
      }
    }
  };

  useEffect(() => {
    mounted.current = true;
    busy.current = false;
    void checkPermission(false);
    return () => { mounted.current = false; permissionRequest.current++; cameraReady.current = false; };
  }, []);

  const failCamera = () => {
    if (!mounted.current || cameraKey !== cameraAttempt.current) return;
    cameraFailed.current = true;
    cameraReady.current = false;
    setCameraError(true);
  };
  useEffect(() => {
    if (!permission?.granted || ready || cameraError) return;
    // Native devices without a usable camera may never emit ready or mount-error.
    const timer = setTimeout(failCamera, 12_000);
    return () => clearTimeout(timer);
  }, [permission?.granted, ready, cameraError, cameraKey]);

  const openSettings = async () => {
    try { await Linking.openSettings(); }
    catch { if (mounted.current) setError('Open your device settings and enable camera access for this app.'); }
  };

  if (checking || requesting) return <View>
    <ActivityIndicator color={colors.primary} />
    <Text accessibilityLiveRegion="polite" style={textStyles.body}>
      {requesting ? 'Requesting camera permission…' : 'Checking camera permission…'}
    </Text>
  </View>;
  if (error) return <View><Notice>{error}</Notice>
    <Button label="Retry camera permission" onPress={() => { void checkPermission(false); }} />
  </View>;
  if (!permission?.granted) return <View>
    <Text accessibilityRole="header" style={textStyles.title}>
      {permission?.status === 'denied' ? 'Camera access denied' : 'Camera access needed'}
    </Text>
    <Text style={textStyles.body}>Allow camera access to scan admission ticket QR codes.</Text>
    {permission?.canAskAgain
      ? <Button label="Allow camera access" onPress={() => { void checkPermission(true); }} />
      : <Button label="Open camera settings" onPress={() => { void openSettings(); }} />}
    <Button label="Check camera permission again" secondary onPress={() => { void checkPermission(false); }} />
  </View>;
  if (cameraError) return <View>
    <Notice>The camera is unavailable or could not start. Close other camera apps and try again on a physical device.</Notice>
    <Button label="Retry camera" onPress={() => {
      cameraAttempt.current++;
      cameraFailed.current = false;
      cameraReady.current = false;
      setReady(false);
      setCameraError(false);
      setCameraKey(cameraAttempt.current);
    }} />
  </View>;
  return <View>
    <Text accessibilityLiveRegion="polite" style={textStyles.body}>
      {ready ? 'Point the camera at one admission ticket QR.' : 'Starting camera…'}
    </Text>
    <CameraView key={cameraKey} style={styles.camera} facing="back" mode="picture" mute
      barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      accessibilityLabel="Admission ticket QR camera"
      onCameraReady={() => {
        if (!mounted.current || cameraKey !== cameraAttempt.current || cameraFailed.current) return;
        cameraReady.current = true;
        setReady(true);
      }}
      onMountError={failCamera}
      onBarcodeScanned={({ data }) => {
        if (mounted.current && cameraReady.current && cameraKey === cameraAttempt.current && typeof data === 'string') onScan(data);
      }} />
    <Text style={styles.help}>Scanning only verifies the ticket. You must confirm Check in separately.</Text>
  </View>;
}

const styles = StyleSheet.create({
  camera: { width: '100%', height: 250, borderRadius: 12, overflow: 'hidden', backgroundColor: '#17233A' },
  help: { fontSize: 15, lineHeight: 22, color: colors.muted, marginTop: 12, marginBottom: 16 },
});
