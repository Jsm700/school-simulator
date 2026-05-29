// src/screens/WelcomeScreen.js
import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  CLASS_OPTIONS,
  SUBJECT_OPTIONS,
  PUBLISHER_OPTIONS,
  getLessons,
} from "../data/lessons";
import { colors, spacing, radius } from "../theme";

function Picker({ label, options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <View style={styles.pickerGroup}>
      <Text style={styles.pickerLabel}>{label}</Text>
      <TouchableOpacity
        style={styles.pickerBtn}
        onPress={() => setOpen(!open)}
        activeOpacity={0.7}
      >
        <Text style={[styles.pickerBtnText, !selected && { color: colors.muted }]}>
          {selected ? selected.label : `-- Изберете ${label.toLowerCase()} --`}
        </Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
          color={colors.muted}
        />
      </TouchableOpacity>
      {open && (
        <View style={styles.dropdown}>
          {options.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.dropdownItem,
                value === opt.value && styles.dropdownItemActive,
              ]}
              onPress={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              <Text
                style={[
                  styles.dropdownText,
                  value === opt.value && styles.dropdownTextActive,
                ]}
              >
                {opt.label}
              </Text>
              {value === opt.value && (
                <Ionicons name="checkmark" size={16} color={colors.primary} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

export default function WelcomeScreen({ navigation }) {
  const [classVal, setClassVal] = useState("4");
  const [subject, setSubject] = useState("human_society");
  const [publisher, setPublisher] = useState("klett");
  const [selectedLesson, setSelectedLesson] = useState(null);

  const lessonGroup = getLessons(classVal, subject, publisher);

  const handleStart = () => {
    if (!selectedLesson) return;
    navigation.navigate("Quiz", { lesson: selectedLesson });
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Text style={{ fontSize: 20 }}>🎓</Text>
        </View>
        <View>
          <Text style={styles.headerTitle}>Училищен Симулатор</Text>
          <Text style={styles.headerSub}>Изберете урок за изпитване</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Settings Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>⚙️ Настройки</Text>
          <Picker
            label="Клас"
            options={CLASS_OPTIONS}
            value={classVal}
            onChange={(v) => { setClassVal(v); setSelectedLesson(null); }}
          />
          <Picker
            label="Предмет"
            options={SUBJECT_OPTIONS}
            value={subject}
            onChange={(v) => { setSubject(v); setSelectedLesson(null); }}
          />
          <Picker
            label="Издателство"
            options={PUBLISHER_OPTIONS}
            value={publisher}
            onChange={(v) => { setPublisher(v); setSelectedLesson(null); }}
          />
        </View>

        {/* Lessons */}
        {lessonGroup ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>📚 Уроци</Text>
            {lessonGroup.lessons.map((lesson) => (
              <TouchableOpacity
                key={lesson.id}
                style={[
                  styles.lessonCard,
                  selectedLesson?.id === lesson.id && styles.lessonCardActive,
                ]}
                onPress={() => setSelectedLesson(lesson)}
                activeOpacity={0.7}
              >
                <View style={styles.lessonNum}>
                  <Text style={styles.lessonNumText}>{lesson.id}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lessonTitle}>{lesson.title}</Text>
                  <Text style={styles.lessonSub}>{lesson.subtitle}</Text>
                </View>
                {selectedLesson?.id === lesson.id && (
                  <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.infoBanner}>
            <Text style={{ fontSize: 18 }}>💡</Text>
            <Text style={styles.infoBannerText}>
              За тази комбинация уроците идват скоро. Опитай 4. клас • Човекът и обществото • Клет.
            </Text>
          </View>
        )}

        {/* Start Button */}
        <TouchableOpacity
          style={[styles.startBtn, !selectedLesson && styles.startBtnDisabled]}
          onPress={handleStart}
          disabled={!selectedLesson}
          activeOpacity={0.8}
        >
          <Text style={styles.startBtnText}>Започни изпитването</Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.primary },
  header: {
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
  },
  headerSub: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    marginTop: 2,
  },
  scroll: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: spacing.lg },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.lg,
  },
  pickerGroup: { marginBottom: spacing.md },
  pickerLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  pickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.background,
  },
  pickerBtnText: { fontSize: 15, color: colors.text, flex: 1 },
  dropdown: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    marginTop: 4,
    overflow: "hidden",
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  dropdownItemActive: { backgroundColor: colors.primaryLight },
  dropdownText: { fontSize: 15, color: colors.text },
  dropdownTextActive: { color: colors.primary, fontWeight: "600" },
  lessonCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.background,
  },
  lessonCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  lessonNum: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  lessonNumText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.primaryDark,
  },
  lessonTitle: { fontSize: 14, fontWeight: "600", color: colors.text },
  lessonSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  infoBanner: {
    backgroundColor: "#FFF3CD",
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
    marginBottom: spacing.md,
  },
  infoBannerText: { flex: 1, fontSize: 13, color: "#633806" },
  startBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  startBtnDisabled: { backgroundColor: "#B5D4F4" },
  startBtnText: { color: "#fff", fontSize: 17, fontWeight: "800" },
});
