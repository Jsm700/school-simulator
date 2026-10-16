// src/screens/InteractiveScreen.js
// „Опит на живо“: интерактивна мини-страница към урока (симулация, тренажор, детектор на грешки).
// HTML-ът живее в KV, в полето interactive.html на урока — нови опити се добавят без билд.
// Страницата може да праща резултат: window.ReactNativeWebView.postMessage({type:"score",right,total}).
import React, { useEffect, useState, useRef, useCallback } from "react";
import { View, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { Text } from "../ui/Typography";
import { colors, spacing, radius, subjectStyle } from "../theme";
import { logActivityMinutes } from "../services/deviceLink";

const WORKER_URL = "https://frosty-dawn-e989.yassen-mladenov.workers.dev";

export default function InteractiveScreen({ route, navigation }) {
  const { lesson, studentName, studentGender, studentGrade } = route.params;
  const [html, setHtml] = useState(null);
  const [error, setError] = useState(false);
  const [result, setResult] = useState(null); // {right,total}
  const enteredAtRef = useRef(Date.now());
  const subj = subjectStyle(lesson.subject);

  useEffect(() => {
    return () => {
      const minutes = (Date.now() - enteredAtRef.current) / 60000;
      if (minutes >= 0.15) logActivityMinutes(minutes);
    };
  }, []);

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
        const page = parsed && parsed.interactive && parsed.interactive.html;
        if (!cancelled) {
          if (page) setHtml(page);
          else setError(true);
        }
      } catch (e) {
        if (!cancelled) setError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [lesson.kvKey]);

  const onMessage = useCallback((e) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg && msg.type === "score") setResult({ right: msg.right, total: msg.total });
    } catch (err) {}
  }, []);

  const goExam = useCallback(() => {
    navigation.replace("Quiz", { lesson, studentName, studentGender, studentGrade });
  }, [navigation, lesson, studentName, studentGender, studentGrade]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backHit} accessibilityRole="button">
          <Text style={styles.back}>‹ Назад</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.eyebrow, { color: subj.color }]}>{subj.emoji} ОПИТ НА ЖИВО</Text>
          <Text style={styles.title} numberOfLines={1}>{lesson.title}</Text>
        </View>
        {result && result.total > 0 ? (
          <View style={styles.scorePill}>
            <Text style={styles.scoreText}>{result.right}/{result.total}</Text>
          </View>
        ) : null}
      </View>

      <View style={{ flex: 1 }}>
        {error ? (
          <View style={styles.center}>
            <Text style={styles.muted}>Опитът не се зареди. Провери връзката.</Text>
          </View>
        ) : html ? (
          <WebView
            originWhitelist={["*"]}
            source={{ html, baseUrl: "https://uchko.app/" }}
            onMessage={onMessage}
            javaScriptEnabled
            domStorageEnabled
            setSupportMultipleWindows={false}
            style={{ backgroundColor: colors.background }}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.center}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            )}
          />
        ) : (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.examBtn} onPress={goExam} activeOpacity={0.85}>
          <Text style={styles.examBtnText}>Готов съм за изпит →</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.card },
  header: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card,
  },
  backHit: { minHeight: 44, justifyContent: "center" },
  back: { fontSize: 16, fontWeight: "800", color: colors.primary },
  eyebrow: { fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  title: { fontSize: 15, fontFamily: "display", fontWeight: "700", color: colors.text },
  scorePill: { backgroundColor: colors.successLight, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 6 },
  scoreText: { fontSize: 14, fontWeight: "900", color: colors.success },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  muted: { fontSize: 15, color: colors.muted },
  footer: {
    padding: spacing.md, paddingBottom: spacing.lg, backgroundColor: colors.card,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  examBtn: {
    backgroundColor: colors.accent, borderRadius: radius.lg, minHeight: 52,
    alignItems: "center", justifyContent: "center",
  },
  examBtnText: { color: "#fff", fontSize: 17, fontWeight: "900" },
});
