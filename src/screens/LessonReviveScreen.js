// src/screens/LessonReviveScreen.js
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { colors, spacing, radius } from "../theme";
import { getSceneProgress, saveSceneProgress } from "../services/sceneProgress";
import { BACKEND_URL, getCurrentChildId } from "../services/deviceLink";

const WORKER_URL = "https://frosty-dawn-e989.yassen-mladenov.workers.dev";

export default function LessonReviveScreen({ route, navigation }) {
  const { lesson, studentName, studentGender, studentGrade } = route.params;

  const [scenes, setScenes] = useState(null);
  const [vocabulary, setVocabulary] = useState({});
  const [loading, setLoading] = useState(true);
  const [sceneIndex, setSceneIndex] = useState(0);
  // Помни избора на детето за ВСЯКА сцена по индекс, за да може да се връща назад/напред без да губи прогреса
  const [sceneChoices, setSceneChoices] = useState({});
  // Термини от тетрадката, вече успешно внесени за този урок — не се показват повторно
  const [doneTerms, setDoneTerms] = useState(new Set());
  const [notebookPhoto, setNotebookPhoto] = useState(null); // {uri, base64}
  const [notebookChecking, setNotebookChecking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(WORKER_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "kv_get", key: lesson.kvKey || "" }),
        });
        const data = await res.json();
        const parsed = data.value ? JSON.parse(data.value) : null;
        const loadedScenes = parsed && Array.isArray(parsed.reviveScenes) ? parsed.reviveScenes : [];
        if (cancelled) return;
        setScenes(loadedScenes);
        setVocabulary((parsed && parsed.vocabulary) || {});

        // Кои термини от тетрадката вече са внесени за този урок — да не се питат повторно
        if (lesson.kvKey) {
          const childId = await getCurrentChildId();
          if (childId) {
            try {
              const nbRes = await fetch(
                `${BACKEND_URL}/children/${childId}/notebook?kv_key=${encodeURIComponent(lesson.kvKey)}`
              );
              const nbEntries = await nbRes.json();
              if (!cancelled && Array.isArray(nbEntries)) {
                setDoneTerms(new Set(nbEntries.map((e) => e.term)));
              }
            } catch (e) {
              // тихо — тетрадката е бонус функция, не бива да чупи основния поток
            }
          }
        }

        // Възстанови позицията на детето, ако вече е гледало този урок преди
        if (lesson.kvKey && loadedScenes.length > 0) {
          const saved = await getSceneProgress(lesson.kvKey);
          if (!cancelled && saved) {
            const clampedIndex = Math.min(Math.max(saved.sceneIndex || 0, 0), loadedScenes.length - 1);
            setSceneIndex(clampedIndex);
            setSceneChoices(saved.choices || {});
          }
        }
      } catch (e) {
        if (!cancelled) setScenes([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lesson.kvKey]);

  // Записва позицията при всяка промяна (нова сцена или нов избор), за да "Днес" и
  // самият екран да могат да продължат оттам, откъдето детето е спряло
  useEffect(() => {
    if (!lesson.kvKey || !scenes || scenes.length === 0) return;
    saveSceneProgress(lesson.kvKey, { sceneIndex, total: scenes.length, choices: sceneChoices });
  }, [lesson.kvKey, scenes, sceneIndex, sceneChoices]);

  useEffect(() => {
    setNotebookPhoto(null);
  }, [sceneIndex]);

  const selectedChoice = sceneChoices[sceneIndex] || null;

  const handleChoice = useCallback((choice) => {
    setSceneChoices((prev) => ({ ...prev, [sceneIndex]: choice }));
  }, [sceneIndex]);

  const handleNext = useCallback(() => {
    setSceneIndex((i) => i + 1);
  }, []);

  const handlePrevScene = useCallback(() => {
    if (sceneIndex > 0) {
      setSceneIndex((i) => i - 1);
    } else {
      navigation.goBack();
    }
  }, [sceneIndex, navigation]);

  const handleGoToExam = useCallback(() => {
    navigation.replace("Quiz", { lesson, studentName, studentGender, studentGrade });
  }, [navigation, lesson, studentName, studentGender, studentGrade]);

  const pickNotebookPhoto = useCallback(async (fromCamera) => {
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
    setNotebookPhoto({ uri: asset.uri, base64: `data:image/jpeg;base64,${asset.base64}` });
  }, []);

  const submitNotebookPhoto = useCallback(async (term) => {
    if (!notebookPhoto || !lesson.kvKey) return;
    const childId = await getCurrentChildId();
    if (!childId) return;
    setNotebookChecking(true);
    try {
      const res = await fetch(`${BACKEND_URL}/children/${childId}/notebook/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kv_key: lesson.kvKey,
          term,
          definition: vocabulary[term] || "",
          image: notebookPhoto.base64,
        }),
      });
      const data = await res.json();
      if (data.passed || data.already_done) {
        setDoneTerms((prev) => new Set(prev).add(term));
        setNotebookPhoto(null);
        if (data.passed) {
          const bonusNote = data.has_bonus ? " (+ бонус за собствено обяснение!)" : "";
          Alert.alert("✅ Прието!", `${data.feedback}\n\n+${data.points} точки${bonusNote}`);
        }
      } else {
        Alert.alert("Опитай пак", data.feedback || "Не изглежда напълно готово — провери и пробвай пак.");
        setNotebookPhoto(null);
      }
    } catch (e) {
      Alert.alert("Грешка", "Нещо се обърка. Провери връзката и опитай пак.");
    } finally {
      setNotebookChecking(false);
    }
  }, [notebookPhoto, lesson.kvKey, vocabulary]);

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!scenes || scenes.length === 0) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.emptyText}>Няма подготвителни сцени за този урок.</Text>
        <TouchableOpacity style={styles.examBtn} onPress={handleGoToExam}>
          <Text style={styles.examBtnText}>Започни изпита</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const isLastScene = sceneIndex === scenes.length - 1;
  const scene = scenes[sceneIndex];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handlePrevScene}>
          <Text style={styles.backBtn}>‹ {sceneIndex > 0 ? "Предишна сцена" : "Назад"}</Text>
        </TouchableOpacity>
        <Text style={styles.progress}>{sceneIndex + 1} / {scenes.length}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{lesson.title}</Text>
        <Text style={styles.sceneText}>{scene.text}</Text>

        {(() => {
          const pendingTerms = (scene.vocabTerms || []).filter((t) => !doneTerms.has(t));
          if (pendingTerms.length === 0) return null;
          const term = pendingTerms[0];
          return (
            <View style={styles.notebookBox}>
              <Text style={styles.notebookPrompt}>
                📝 Запиши в тетрадката: <Text style={{ fontWeight: "700" }}>{term}</Text>
                {vocabulary[term] ? ` — ${vocabulary[term]}` : ""}
              </Text>
              <Text style={styles.notebookBonus}>
                ✨ Бонус, ако искаш: обясни и със свои думи — допълнителни точки
              </Text>

              {notebookPhoto ? (
                <>
                  <Image source={{ uri: notebookPhoto.uri }} style={styles.notebookPreview} />
                  <TouchableOpacity
                    style={styles.notebookSubmitBtn}
                    onPress={() => submitNotebookPhoto(term)}
                    disabled={notebookChecking}
                  >
                    {notebookChecking ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.notebookBtnText}>Прати за проверка</Text>
                    )}
                  </TouchableOpacity>
                </>
              ) : (
                <View style={styles.notebookRow}>
                  <TouchableOpacity style={styles.notebookBtn} onPress={() => pickNotebookPhoto(true)}>
                    <Text style={styles.notebookBtnText}>📷 Снимай</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.notebookBtn, styles.notebookBtnSecondary]}
                    onPress={() => pickNotebookPhoto(false)}
                  >
                    <Text style={styles.notebookBtnText}>🖼️ Галерия</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })()}

        {(scene.choices || []).map((choice, idx) => {
          const isSelected = selectedChoice && selectedChoice.label === choice.label;
          return (
            <TouchableOpacity
              key={idx}
              style={[styles.choiceBtn, isSelected && styles.choiceBtnSelected]}
              onPress={() => handleChoice(choice)}
            >
              <Text style={[styles.choiceBtnText, isSelected && styles.choiceBtnTextSelected]}>
                {choice.label}
              </Text>
            </TouchableOpacity>
          );
        })}

        {selectedChoice && (
          <View style={styles.feedbackBox}>
            <Text style={styles.feedbackText}>{selectedChoice.feedback}</Text>
          </View>
        )}

        {selectedChoice && (
          <TouchableOpacity
            style={styles.nextBtn}
            onPress={isLastScene ? handleGoToExam : handleNext}
          >
            <Text style={styles.nextBtnText}>
              {isLastScene ? "Готов съм за изпит" : "Напред"}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  backBtn: { fontSize: 15, color: colors.primary },
  progress: { fontSize: 13, color: colors.muted },
  content: { padding: spacing.xl },
  title: { fontSize: 18, fontWeight: "700", color: colors.text, marginBottom: spacing.lg },
  sceneText: { fontSize: 16, color: colors.text, lineHeight: 24, marginBottom: spacing.xl },
  choiceBtn: {
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  choiceBtnText: { fontSize: 15, color: colors.text },
  choiceBtnSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  choiceBtnTextSelected: { color: colors.primaryDark, fontWeight: "600" },
  feedbackBox: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  feedbackText: { fontSize: 15, color: colors.primaryDark, lineHeight: 22 },
  nextBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
    marginTop: spacing.lg,
  },
  nextBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  notebookBox: {
    backgroundColor: colors.successLight, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.success,
  },
  notebookPrompt: { fontSize: 14, color: colors.text, lineHeight: 20 },
  notebookBonus: { fontSize: 12, color: colors.muted, marginTop: spacing.xs, marginBottom: spacing.sm },
  notebookRow: { flexDirection: "row", gap: spacing.sm },
  notebookBtn: {
    flex: 1, backgroundColor: colors.success, borderRadius: radius.sm,
    padding: spacing.sm, alignItems: "center",
  },
  notebookBtnSecondary: { backgroundColor: colors.primary },
  notebookBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  notebookPreview: { width: "100%", height: 160, borderRadius: radius.sm, marginBottom: spacing.sm, resizeMode: "cover" },
  notebookSubmitBtn: { backgroundColor: colors.warning, borderRadius: radius.sm, padding: spacing.sm, alignItems: "center" },
  emptyText: { fontSize: 15, color: colors.muted, marginBottom: spacing.lg, textAlign: "center" },
  examBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  examBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
