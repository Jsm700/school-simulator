// src/screens/LessonReviveScreen.js
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  View,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
  Alert,
} from "react-native";
import { Text } from "../ui/Typography";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { colors, spacing, radius, subjectStyle } from "../theme";
import { getSceneProgress, saveSceneProgress } from "../services/sceneProgress";
import { BACKEND_URL, getCurrentChildId, logActivityMinutes } from "../services/deviceLink";

const WORKER_URL = "https://frosty-dawn-e989.yassen-mladenov.workers.dev";

export default function LessonReviveScreen({ route, navigation }) {
  const { lesson, studentName, studentGender, studentGrade } = route.params;

  // Focus-line: логва реално прекараното време в урока при излизане от екрана
  const enteredAtRef = useRef(Date.now());
  useEffect(() => {
    return () => {
      const minutes = (Date.now() - enteredAtRef.current) / 60000;
      if (minutes >= 0.15) logActivityMinutes(minutes);
    };
  }, []);

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

  // След сцените: ако урокът има „Опит на живо“ — първо него, после изпита
  const handleFinishScenes = useCallback(() => {
    navigation.replace(lesson.hasInteractive ? "Interactive" : "Quiz", { lesson, studentName, studentGender, studentGrade });
  }, [navigation, lesson, studentName, studentGender, studentGrade]);

  const pickNotebookPhoto = useCallback(async (fromCamera) => {
    try {
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
    } catch (e) {
      console.error("LessonReviveScreen.pickNotebookPhoto error:", e);
      Alert.alert("Грешка при снимане", String((e && e.message) || e));
    }
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
          const extras = [];
          if (data.has_bonus) extras.push("+ бонус за собствено обяснение!");
          if (data.is_jackpot) extras.push("🎰 ДЖАКПОТ — двойни точки!");
          if (data.same_day_bonus > 0) extras.push(`🔁 +${data.same_day_bonus} за връщане пак днес`);
          Alert.alert("✅ Прието!", `${data.feedback}\n\n+${data.points} точки${extras.length ? `\n${extras.join(" · ")}` : ""}`);
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

  // Разбърква реда на отговорите при показване, за да не може детето просто да
  // запомни "верният отговор е винаги първи" — пресмята се веднъж на сцена
  // (не при всеки re-render, напр. след избор на отговор).
  const shuffledChoices = useMemo(() => {
    const currentScene = scenes && scenes[sceneIndex];
    const arr = [...((currentScene && currentScene.choices) || [])];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [scenes, sceneIndex]);

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
  const scenesRemaining = scenes.length - sceneIndex; // включва текущата
  const almostDone = !isLastScene && scenesRemaining <= 2;
  const scene = scenes[sceneIndex];
  const subj = subjectStyle(lesson.subject);
  // В KV първият отговор е верният; на екрана редът е разбъркан
  const correctLabel = scene.choices && scene.choices[0] ? scene.choices[0].label : null;
  const noChoices = !scene.choices || scene.choices.length === 0;
  const isCorrect = noChoices || (!!selectedChoice && selectedChoice.label === correctLabel);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={handlePrevScene} style={styles.backHit} accessibilityRole="button">
            <Text style={styles.backBtn}>‹ {sceneIndex > 0 ? "Назад" : "Изход"}</Text>
          </TouchableOpacity>
          <Text style={styles.progress}>Сцена {sceneIndex + 1} от {scenes.length}</Text>
        </View>
        <View style={styles.segments}>
          {scenes.map((_, i) => (
            <View
              key={i}
              style={[styles.segment, i < sceneIndex && styles.segmentDone, i === sceneIndex && styles.segmentNow]}
            />
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.eyebrow, { color: subj.color }]}>{subj.emoji} ОЖИВИ УРОКА</Text>
        <Text style={styles.title}>{lesson.title}</Text>

        <View style={styles.storyCard}>
          <Text style={styles.sceneText}>{scene.text}</Text>
        </View>

        {(() => {
          const pendingTerms = (scene.vocabTerms || []).filter((t) => !doneTerms.has(t));
          if (pendingTerms.length === 0) return null;
          const term = pendingTerms[0];
          return (
            <View style={styles.notebookBox}>
              <Text style={styles.notebookLabel}>📝 ЗАПИШИ В ТЕТРАДКАТА</Text>
              <Text style={styles.notebookTerm}>{term}</Text>
              {vocabulary[term] ? <Text style={styles.notebookDef}>{vocabulary[term]}</Text> : null}
              <Text style={styles.notebookBonus}>
                ✨ Бонус: обясни и със свои думи — допълнителни точки
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
                    <Text style={[styles.notebookBtnText, { color: colors.success }]}>🖼️ Галерия</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })()}

        {!noChoices && (
          <Text style={styles.chooseLabel}>{isCorrect ? "Точно така!" : selectedChoice ? "Опитай пак:" : "Какво мислиш?"}</Text>
        )}
        {shuffledChoices.map((choice, idx) => {
          const isSelected = selectedChoice && selectedChoice.label === choice.label;
          const right = isSelected && isCorrect;
          const wrong = isSelected && !isCorrect;
          return (
            <TouchableOpacity
              key={idx}
              style={[styles.choiceBtn, right && styles.choiceRight, wrong && styles.choiceWrong]}
              onPress={() => handleChoice(choice)}
              disabled={isCorrect}
              activeOpacity={0.8}
            >
              <View style={[styles.choiceLetter, right && { backgroundColor: colors.success }, wrong && { backgroundColor: colors.danger }]}>
                <Text style={[styles.choiceLetterText, (right || wrong) && { color: "#fff" }]}>
                  {right ? "✓" : wrong ? "✗" : String.fromCharCode(1040 + idx)}
                </Text>
              </View>
              <Text style={[styles.choiceBtnText, (right || wrong) && { fontWeight: "700" }]}>
                {choice.label}
              </Text>
            </TouchableOpacity>
          );
        })}

        {selectedChoice && (
          <View style={[styles.feedbackBox, isCorrect ? styles.feedbackRight : styles.feedbackWrong]}>
            <Text style={[styles.feedbackText, { color: isCorrect ? "#145E3D" : "#8A2018" }]}>
              {selectedChoice.feedback}
            </Text>
          </View>
        )}

        {isCorrect && (
          <TouchableOpacity
            style={[styles.nextBtn, (almostDone || isLastScene) && styles.nextBtnAlmostDone]}
            onPress={isLastScene ? handleFinishScenes : handleNext}
            activeOpacity={0.85}
          >
            <Text style={styles.nextBtnText}>
              {isLastScene
                ? lesson.hasInteractive ? "Към опита на живо →" : "Готов съм за изпит →"
                : almostDone
                ? scenesRemaining - 1 === 1
                  ? "Последна сцена след тази! 🔥"
                  : `Само ${scenesRemaining - 1} сцени до края! 🔥`
                : "Напред →"}
            </Text>
          </TouchableOpacity>
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1, backgroundColor: colors.background,
    alignItems: "center", justifyContent: "center", padding: spacing.xl,
  },
  header: {
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md,
    backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  backHit: { minHeight: 40, justifyContent: "center", paddingRight: spacing.md },
  backBtn: { fontSize: 16, color: colors.primary, fontWeight: "800" },
  progress: { fontSize: 13, color: colors.muted, fontWeight: "700" },
  segments: { flexDirection: "row", gap: 4, marginTop: 6 },
  segment: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.pillTodo },
  segmentDone: { backgroundColor: colors.success },
  segmentNow: { backgroundColor: colors.accent },
  content: { padding: spacing.lg },
  eyebrow: { fontSize: 12, fontWeight: "900", letterSpacing: 1.2 },
  title: { fontSize: 20, fontFamily: "display", fontWeight: "700", color: colors.text, marginTop: 4, marginBottom: spacing.lg },
  storyCard: {
    backgroundColor: colors.card, borderRadius: radius.xl, padding: spacing.xl,
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.lg,
    borderLeftWidth: 5, borderLeftColor: colors.energy,
  },
  sceneText: { fontSize: 18, color: colors.text, lineHeight: 28 },
  chooseLabel: { fontSize: 13, fontWeight: "900", color: colors.muted, letterSpacing: 0.8, marginBottom: spacing.sm, textTransform: "uppercase" },
  choiceBtn: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.card, borderWidth: 2, borderColor: colors.border,
    borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, minHeight: 56,
  },
  choiceRight: { borderColor: colors.success, backgroundColor: colors.successLight },
  choiceWrong: { borderColor: colors.danger, backgroundColor: colors.dangerLight },
  choiceLetter: {
    width: 32, height: 32, borderRadius: 10, backgroundColor: colors.background,
    alignItems: "center", justifyContent: "center",
  },
  choiceLetterText: { fontSize: 15, fontWeight: "900", color: colors.muted },
  choiceBtnText: { flex: 1, fontSize: 16, color: colors.text, lineHeight: 22 },
  feedbackBox: { borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.xs },
  feedbackRight: { backgroundColor: colors.successLight },
  feedbackWrong: { backgroundColor: colors.dangerLight },
  feedbackText: { fontSize: 16, lineHeight: 24 },
  nextBtn: {
    backgroundColor: colors.primary, borderRadius: radius.lg, minHeight: 54,
    alignItems: "center", justifyContent: "center", marginTop: spacing.lg,
  },
  nextBtnText: { color: "#fff", fontSize: 17, fontWeight: "900" },
  nextBtnAlmostDone: { backgroundColor: colors.accent },
  notebookBox: {
    backgroundColor: colors.successLight, borderRadius: radius.xl,
    padding: spacing.lg, marginBottom: spacing.lg,
  },
  notebookLabel: { fontSize: 12, fontWeight: "900", color: colors.success, letterSpacing: 1 },
  notebookTerm: { fontSize: 18, fontFamily: "display", fontWeight: "700", color: colors.text, marginTop: 6 },
  notebookDef: { fontSize: 15, color: colors.text, lineHeight: 22, marginTop: 4 },
  notebookBonus: { fontSize: 13, color: colors.muted, marginTop: spacing.sm, marginBottom: spacing.md },
  notebookRow: { flexDirection: "row", gap: spacing.sm },
  notebookBtn: {
    flex: 1, backgroundColor: colors.success, borderRadius: radius.md,
    minHeight: 46, alignItems: "center", justifyContent: "center",
  },
  notebookBtnSecondary: { backgroundColor: colors.card, borderWidth: 2, borderColor: colors.success },
  notebookBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  notebookPreview: { width: "100%", height: 180, borderRadius: radius.md, marginBottom: spacing.sm, resizeMode: "cover" },
  notebookSubmitBtn: { backgroundColor: colors.accent, borderRadius: radius.md, minHeight: 46, alignItems: "center", justifyContent: "center" },
  emptyText: { fontSize: 16, color: colors.muted, marginBottom: spacing.lg, textAlign: "center" },
  examBtn: {
    backgroundColor: colors.primary, borderRadius: radius.md,
    minHeight: 50, justifyContent: "center", paddingHorizontal: spacing.xl,
  },
  examBtnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});
