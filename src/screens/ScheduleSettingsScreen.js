// src/screens/ScheduleSettingsScreen.js
import React, { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SUBJECT_OPTIONS } from "../data/lessons";
import { getSchedule, setSchedule as saveSchedule, WEEKDAY_LABELS } from "../services/schedule";
import { colors, spacing, radius } from "../theme";

export default function ScheduleSettingsScreen({ navigation }) {
  const [schedule, setScheduleState] = useState({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getSchedule().then((s) => {
      setScheduleState(s);
      setLoaded(true);
    });
  }, []);

  const toggleDay = useCallback((subjectValue, dayValue) => {
    setScheduleState((prev) => {
      const current = prev[subjectValue] || [];
      const has = current.includes(dayValue);
      const updated = has ? current.filter((d) => d !== dayValue) : [...current, dayValue];
      const next = { ...prev, [subjectValue]: updated };
      saveSchedule(next);
      return next;
    });
  }, []);

  if (!loaded) return <SafeAreaView style={styles.container} />;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backBtn}>‹ Назад</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Седмичен график</Text>
      </View>
      <Text style={styles.hint}>
        Отбележи кои дни има детето час по всеки предмет в училище — приложението ще
        предлага упражнение вечерта преди часа, не задължително всеки ден.
      </Text>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        {SUBJECT_OPTIONS.map((subj) => (
          <View key={subj.value} style={styles.subjectRow}>
            <Text style={styles.subjectLabel}>{subj.label}</Text>
            <View style={styles.daysRow}>
              {WEEKDAY_LABELS.map((d) => {
                const active = (schedule[subj.value] || []).includes(d.value);
                return (
                  <TouchableOpacity
                    key={d.value}
                    style={[styles.dayChip, active && styles.dayChipActive]}
                    onPress={() => toggleDay(subj.value, d.value)}
                  >
                    <Text style={[styles.dayChipText, active && styles.dayChipTextActive]}>
                      {d.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  backBtn: { fontSize: 15, color: colors.primary },
  headerTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  hint: {
    fontSize: 12,
    color: colors.muted,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    lineHeight: 18,
  },
  subjectRow: {
    marginBottom: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  subjectLabel: { fontSize: 14, fontWeight: "600", color: colors.text, marginBottom: spacing.sm },
  daysRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  dayChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayChipText: { fontSize: 12, color: colors.text },
  dayChipTextActive: { color: "#fff", fontWeight: "700" },
});
