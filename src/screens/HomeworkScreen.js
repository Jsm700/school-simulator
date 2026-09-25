// src/screens/HomeworkScreen.js
// Детето вижда чакащите домашни (внесени от родителя през /import), избира
// едно, снима готовото решение (камера или галерия) и го праща за проверка —
// строга за математика, щедра за останалото. При успех автоматично се
// маркира готово и се начисляват точки в общия дневник.

import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Image, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { colors, spacing, radius } from "../theme";
import { BACKEND_URL, getCurrentChildId } from "../services/deviceLink";

export default function HomeworkScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [homework, setHomework] = useState([]);
  const [childId, setChildId] = useState(null);
  const [selected, setSelected] = useState(null); // избраното домашно за снимане
  const [photoUri, setPhotoUri] = useState(null);
  const [photoBase64, setPhotoBase64] = useState(null);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const id = await getCurrentChildId();
    setChildId(id);
    if (!id) { setLoading(false); return; }
    try {
      const res = await fetch(`${BACKEND_URL}/children/${id}/homework?done=false`);
      const data = await res.json();
      setHomework(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("HomeworkScreen load error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pickPhoto = useCallback(async (fromCamera) => {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Няма разрешение", "Трябва достъп до камерата/снимките, за да продължиш.");
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.7 });
    if (result.canceled || !result.assets || !result.assets[0]) return;
    const asset = result.assets[0];
    setPhotoUri(asset.uri);
    setPhotoBase64(`data:image/jpeg;base64,${asset.base64}`);
  }, []);

  const submit = useCallback(async () => {
    if (!selected || !photoBase64 || !childId) return;
    setChecking(true);
    try {
      const res = await fetch(
        `${BACKEND_URL}/children/${childId}/homework/${selected.id}/check`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: photoBase64 }),
        }
      );
      const data = await res.json();
      if (data.passed) {
        const extras = [];
        if (data.is_jackpot) extras.push("🎰 ДЖАКПОТ — двойни точки!");
        if (data.same_day_bonus > 0) extras.push(`🔁 +${data.same_day_bonus} за връщане пак днес`);
        Alert.alert("✅ Прието!", `${data.feedback}\n\n+${data.points} точки${extras.length ? `\n${extras.join(" · ")}` : ""}`, [
          { text: "Супер", onPress: () => { setSelected(null); setPhotoUri(null); setPhotoBase64(null); load(); } },
        ]);
      } else {
        Alert.alert("Опитай пак", data.feedback || "Не изглежда напълно готово — провери и пробвай пак.", [
          { text: "Добре", onPress: () => { setPhotoUri(null); setPhotoBase64(null); } },
        ]);
      }
    } catch (e) {
      Alert.alert("Грешка", "Нещо се обърка при проверката. Провери връзката и опитай пак.");
    } finally {
      setChecking(false);
    }
  }, [selected, photoBase64, childId, load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  // Екран за снимане на избраното домашно
  if (selected) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
          <TouchableOpacity onPress={() => { setSelected(null); setPhotoUri(null); setPhotoBase64(null); }}>
            <Text style={styles.backLink}>‹ Назад към списъка</Text>
          </TouchableOpacity>

          <View style={styles.card}>
            <Text style={styles.taskSubject}>{selected.subject || "Домашно"}</Text>
            <Text style={styles.taskText}>{selected.task_text}</Text>
          </View>

          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.preview} />
          ) : (
            <View style={styles.placeholder}>
              <Text style={styles.mutedText}>Няма избрана снимка още</Text>
            </View>
          )}

          <TouchableOpacity style={styles.bigBtn} onPress={() => pickPhoto(true)} disabled={checking}>
            <Text style={styles.bigBtnText}>📷 Снимай сега</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.bigBtn, styles.bigBtnSecondary]} onPress={() => pickPhoto(false)} disabled={checking}>
            <Text style={styles.bigBtnText}>🖼️ Избери от галерията</Text>
          </TouchableOpacity>

          {photoUri && (
            <TouchableOpacity
              style={[styles.bigBtn, styles.bigBtnSubmit]}
              onPress={submit}
              disabled={checking}
            >
              {checking ? <ActivityIndicator color="#fff" /> : <Text style={styles.bigBtnText}>Прати за проверка</Text>}
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Списък с чакащи домашни
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backLink}>‹ Назад</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>📚 Домашни</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        {homework.length === 0 ? (
          <Text style={styles.mutedText}>Няма чакащи домашни точно сега 🎉</Text>
        ) : (
          homework.map((hw) => (
            <TouchableOpacity key={hw.id} style={styles.card} onPress={() => setSelected(hw)}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={styles.taskSubject}>{hw.subject || "(предмет?)"}</Text>
                {hw.due_date ? <Text style={styles.mutedText}>срок: {hw.due_date}</Text> : null}
              </View>
              <Text style={styles.taskText}>{hw.task_text}</Text>
              <Text style={styles.tapHint}>Тапни, за да снимаш →</Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  header: { padding: spacing.lg, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  headerTitle: { fontSize: 18, fontWeight: "700", color: colors.text, marginTop: spacing.xs },
  backLink: { color: colors.primary, fontSize: 15, fontWeight: "600" },
  card: {
    backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 0.5,
    borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md,
  },
  taskSubject: { fontSize: 15, fontWeight: "700", color: colors.text },
  taskText: { fontSize: 14, color: colors.text, marginTop: spacing.xs },
  tapHint: { fontSize: 12, color: colors.primary, marginTop: spacing.sm },
  mutedText: { fontSize: 14, color: colors.muted },
  preview: { width: "100%", height: 260, borderRadius: radius.md, marginBottom: spacing.md, resizeMode: "cover" },
  placeholder: {
    height: 200, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    borderStyle: "dashed", alignItems: "center", justifyContent: "center", marginBottom: spacing.md,
  },
  bigBtn: {
    backgroundColor: colors.primary, borderRadius: radius.md,
    padding: spacing.lg, alignItems: "center", marginBottom: spacing.md,
  },
  bigBtnSecondary: { backgroundColor: colors.success },
  bigBtnSubmit: { backgroundColor: colors.warning },
  bigBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
