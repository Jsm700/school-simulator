// src/components/MultiShotCamera.js
// Собствена камера, вградена в приложението (вместо системното камера-приложение),
// за да може детето да снима няколко страници една след друга без да излиза
// от екрана всеки път (условие + решение, или няколко страници домашно).
// Използва expo-camera. Връща масив от {uri, base64} снимки при "Готово".

import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { colors, spacing, radius } from "../theme";

export default function MultiShotCamera({ onDone, onCancel, minShots = 1 }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [shots, setShots] = useState([]); // [{uri, base64}]
  const [capturing, setCapturing] = useState(false);
  const cameraRef = useRef(null);

  const takeShot = useCallback(async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.6,
        skipProcessing: true,
      });
      setShots((prev) => [...prev, { uri: photo.uri, base64: photo.base64 }]);
    } catch (e) {
      console.error("MultiShotCamera.takeShot error:", e);
    } finally {
      setCapturing(false);
    }
  }, [capturing]);

  const removeShot = useCallback((idx) => {
    setShots((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const finish = useCallback(() => {
    if (shots.length < minShots) return;
    onDone(shots);
  }, [shots, minShots, onDone]);

  if (!permission) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.permText}>Трябва достъп до камерата, за да снимаш.</Text>
        <TouchableOpacity style={styles.bigBtn} onPress={requestPermission}>
          <Text style={styles.bigBtnText}>Разреши достъп</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkBtn} onPress={onCancel}>
          <Text style={styles.linkBtnText}>Отказ</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.cameraWrap}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
          <Text style={styles.cancelBtnText}>✕</Text>
        </TouchableOpacity>
        {shots.length > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{shots.length}</Text>
          </View>
        )}
      </View>

      {shots.length > 0 && (
        <ScrollView
          horizontal
          style={styles.thumbRow}
          contentContainerStyle={{ paddingHorizontal: spacing.md }}
          showsHorizontalScrollIndicator={false}
        >
          {shots.map((s, idx) => (
            <TouchableOpacity key={idx} style={styles.thumbWrap} onPress={() => removeShot(idx)}>
              <Image source={{ uri: s.uri }} style={styles.thumb} />
              <View style={styles.thumbRemove}>
                <Text style={styles.thumbRemoveText}>✕</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.shutterBtn, capturing && styles.shutterBtnDisabled]}
          onPress={takeShot}
          disabled={capturing}
        >
          {capturing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.shutterBtnText}>📷 Снимай{shots.length > 0 ? " следваща" : ""}</Text>
          )}
        </TouchableOpacity>

        {shots.length >= minShots && (
          <TouchableOpacity style={styles.doneBtn} onPress={finish}>
            <Text style={styles.doneBtnText}>✓ Готово ({shots.length})</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  center: {
    flex: 1, backgroundColor: colors.background, alignItems: "center",
    justifyContent: "center", padding: spacing.xl,
  },
  permText: { fontSize: 15, color: colors.text, textAlign: "center", marginBottom: spacing.lg },
  cameraWrap: { flex: 1 },
  cancelBtn: {
    position: "absolute", top: spacing.lg, left: spacing.lg,
    width: 40, height: 40, borderRadius: radius.full,
    backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center",
  },
  cancelBtnText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  countBadge: {
    position: "absolute", top: spacing.lg, right: spacing.lg,
    minWidth: 28, height: 28, borderRadius: radius.full, paddingHorizontal: 8,
    backgroundColor: colors.primary, alignItems: "center", justifyContent: "center",
  },
  countBadgeText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  thumbRow: { maxHeight: 88, backgroundColor: "#000", paddingVertical: spacing.sm },
  thumbWrap: { marginRight: spacing.sm },
  thumb: { width: 64, height: 64, borderRadius: radius.sm },
  thumbRemove: {
    position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: radius.full,
    backgroundColor: colors.warning, alignItems: "center", justifyContent: "center",
  },
  thumbRemoveText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  controls: {
    flexDirection: "row", padding: spacing.lg, gap: spacing.md,
    backgroundColor: "#000",
  },
  shutterBtn: {
    flex: 1, backgroundColor: colors.primary, borderRadius: radius.md,
    paddingVertical: spacing.lg, alignItems: "center",
  },
  shutterBtnDisabled: { opacity: 0.6 },
  shutterBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  doneBtn: {
    flex: 1, backgroundColor: colors.success, borderRadius: radius.md,
    paddingVertical: spacing.lg, alignItems: "center",
  },
  doneBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  bigBtn: {
    backgroundColor: colors.primary, borderRadius: radius.md,
    paddingVertical: spacing.md, paddingHorizontal: spacing.xl, marginBottom: spacing.md,
  },
  bigBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  linkBtn: { padding: spacing.sm },
  linkBtnText: { color: colors.muted, fontSize: 14 },
});
