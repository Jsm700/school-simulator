// src/screens/LessonReviveScreen.js
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, radius } from "../theme";

const WORKER_URL = "https://frosty-dawn-e989.yassen-mladenov.workers.dev";

export default function LessonReviveScreen({ route, navigation }) {
  const { lesson, studentName, studentGender, studentGrade } = route.params;

  const [scenes, setScenes] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sceneIndex, setSceneIndex] = useState(0);
  // Помни избора на детето за ВСЯКА сцена по индекс, за да може да се връща назад/напред без да губи прогреса
  const [sceneChoices, setSceneChoices] = useState({});

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
        if (!cancelled) {
          setScenes(parsed && Array.isArray(parsed.reviveScenes) ? parsed.reviveScenes : []);
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
  emptyText: { fontSize: 15, color: colors.muted, marginBottom: spacing.lg, textAlign: "center" },
  examBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  examBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
