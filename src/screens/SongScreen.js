// src/screens/SongScreen.js
// „Песен“: караоке песен към урока — текстът светва дума по дума с гласа, с превод на български.
// Страницата (HTML с вградения MP3) живее в KV под ключ "song-<kvKey на урока>" — нови песни се добавят без билд.
// В index урокът носи hasSong: true. За слушане не се дават точки; времето се брои като активност.
import React, { useEffect, useState, useRef } from "react";
import { View, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { Text } from "../ui/Typography";
import { colors, spacing, subjectStyle } from "../theme";
import { logActivityMinutes } from "../services/deviceLink";

const WORKER_URL = "https://frosty-dawn-e989.yassen-mladenov.workers.dev";

export default function SongScreen({ route, navigation }) {
  const { lesson } = route.params;
  const [html, setHtml] = useState(null);
  const [error, setError] = useState(false);
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
          body: JSON.stringify({ action: "kv_get", key: "song-" + (lesson.kvKey || "") }),
        });
        const data = await res.json();
        if (!cancelled) {
          if (data && typeof data.value === "string" && data.value.length > 0) setHtml(data.value);
          else setError(true);
        }
      } catch (e) {
        if (!cancelled) setError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [lesson.kvKey]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backHit} accessibilityRole="button">
          <Text style={styles.back}>‹ Назад</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.eyebrow, { color: subj.color }]}>🎵 ПЕСЕН</Text>
          <Text style={styles.title} numberOfLines={1}>{lesson.title}</Text>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        {error ? (
          <View style={styles.center}>
            <Text style={styles.muted}>Песента не се зареди. Провери връзката.</Text>
          </View>
        ) : html ? (
          <WebView
            originWhitelist={["*"]}
            source={{ html, baseUrl: "https://uchko.app/" }}
            javaScriptEnabled
            domStorageEnabled
            mediaPlaybackRequiresUserAction
            allowsInlineMediaPlayback
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
            <Text style={[styles.muted, { marginTop: spacing.md }]}>Зареждам песента…</Text>
          </View>
        )}
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  muted: { fontSize: 15, color: colors.muted },
});
