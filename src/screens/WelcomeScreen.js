// src/screens/WelcomeScreen.js
import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  TextInput,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getTeacherResponse } from "../services/ai";
import { startGreetingPrefetch } from "../services/prefetch";
import { getTotalPoints, resetPoints } from "../services/points";
import { Ionicons } from "@expo/vector-icons";
import {
  CLASS_OPTIONS,
  SUBJECT_OPTIONS,
  PUBLISHER_OPTIONS,
  getLessons,
} from "../data/lessons";

const WORKER_URL = "https://frosty-dawn-e989.yassen-mladenov.workers.dev";
const STORAGE_KEY_NAME = "student_name";
const STORAGE_KEY_GENDER = "student_gender";
const STORAGE_KEY_CLASS = "last_class";
const STORAGE_KEY_SUBJECT = "last_subject";
const STORAGE_KEY_SUBJECT_PUBLISHER_MAP = "subject_publisher_map";

async function fetchIndex() {
  const res = await fetch(WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "kv_get", key: "index" }),
  });
  const data = await res.json();
  return data.value ? JSON.parse(data.value) : null;
}
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
  const [subject, setSubject] = useState("human_nature");
  const [publisher, setPublisher] = useState("klett");
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [kvIndex, setKvIndex] = useState(null);
  const [totalPoints, setTotalPoints] = useState(0);

  React.useEffect(() => {
    fetchIndex().then(idx => { if (idx) setKvIndex(idx); });
  }, []);

  const refreshPoints = React.useCallback(() => {
    getTotalPoints().then(setTotalPoints);
  }, []);

  React.useEffect(() => {
    refreshPoints();
  }, [refreshPoints]);

  const handleResetPoints = React.useCallback(() => {
    Alert.alert(
      "Занули точките?",
      "Целият точков дневник ще бъде изтрит. Действието не може да се отмени.",
      [
        { text: "Отказ", style: "cancel" },
        {
          text: "Занули",
          style: "destructive",
          onPress: async () => {
            await resetPoints();
            refreshPoints();
          },
        },
      ]
    );
  }, [refreshPoints]);

  // Издателството се помни ПО ПРЕДМЕТ (напр. история -> Анубис, английски -> Super Minds),
  // не като едно общо "последно избрано" — иначе смяната на предмет носи грешно издателство.
  const subjectPublisherMapRef = useRef({});

  React.useEffect(() => {
    (async () => {
      try {
        const savedClass = await AsyncStorage.getItem(STORAGE_KEY_CLASS);
        const savedSubject = await AsyncStorage.getItem(STORAGE_KEY_SUBJECT);
        const savedMapRaw = await AsyncStorage.getItem(STORAGE_KEY_SUBJECT_PUBLISHER_MAP);
        const savedMap = savedMapRaw ? JSON.parse(savedMapRaw) : {};
        subjectPublisherMapRef.current = savedMap;
        if (savedClass) setClassVal(savedClass);
        if (savedSubject) setSubject(savedSubject);
        const subjectToUse = savedSubject || subject;
        if (savedMap[subjectToUse]) setPublisher(savedMap[subjectToUse]);
      } catch (e) {
        console.error("AsyncStorage load error (class/subject/publisher):", e);
      }
    })();
  }, []);

  const updateClassVal = (v) => {
    setClassVal(v);
    setSelectedLesson(null);
    AsyncStorage.setItem(STORAGE_KEY_CLASS, v).catch(() => {});
  };

  const updateSubject = (v) => {
    setSubject(v);
    setSelectedLesson(null);
    AsyncStorage.setItem(STORAGE_KEY_SUBJECT, v).catch(() => {});
    // Автоматично зарежда издателството, запомнено конкретно за този предмет (ако има такова)
    const rememberedPublisher = subjectPublisherMapRef.current[v];
    if (rememberedPublisher) setPublisher(rememberedPublisher);
  };

  const updatePublisher = (v) => {
    setPublisher(v);
    setSelectedLesson(null);
    const updatedMap = { ...subjectPublisherMapRef.current, [subject]: v };
    subjectPublisherMapRef.current = updatedMap;
    AsyncStorage.setItem(STORAGE_KEY_SUBJECT_PUBLISHER_MAP, JSON.stringify(updatedMap)).catch(() => {});
  };

  const lessonGroup = (() => {
    const key = `${classVal}_${subject}_${publisher}`;
    if (kvIndex && kvIndex[key]) return kvIndex[key];
    return getLessons(classVal, subject, publisher);
  })();

  // Нови полета за ученика
  const [studentName, setStudentName] = useState("");
  const [studentGender, setStudentGender] = useState("male");

  React.useEffect(() => {
    (async () => {
      try {
        const savedName = await AsyncStorage.getItem(STORAGE_KEY_NAME);
        const savedGender = await AsyncStorage.getItem(STORAGE_KEY_GENDER);
        if (savedName) setStudentName(savedName);
        if (savedGender) setStudentGender(savedGender);
      } catch (e) {
        console.error("AsyncStorage load error:", e);
      }
    })();
  }, []);

  const updateStudentName = (name) => {
    setStudentName(name);
    AsyncStorage.setItem(STORAGE_KEY_NAME, name).catch(() => {});
  };

  const updateStudentGender = (gender) => {
    setStudentGender(gender);
    AsyncStorage.setItem(STORAGE_KEY_GENDER, gender).catch(() => {});
  };

  const handleStartExam = () => {
    if (!selectedLesson) return;
    const finalName = studentName || "Тони";
    const signature = `${selectedLesson.id}_${finalName}_${studentGender}_${classVal}`;
    const firstMessages = [{
      role: "user",
      content: "Не ме поздравявай — поздравът вече е изговорен отделно. Задай директно първия си въпрос по днешния урок, без встъпителни думи.",
    }];
    const prefetchPromise = getTeacherResponse(
      firstMessages,
      selectedLesson.content || "",
      finalName,
      studentGender,
      classVal,
      selectedLesson.kvKey || ""
    );
    prefetchPromise.catch(() => {}); // избягва "Unhandled promise rejection", ако Quiz екранът не го вземе навреме
    startGreetingPrefetch(signature, prefetchPromise);

    navigation.navigate("Quiz", {
      lesson: selectedLesson,
      studentName: finalName,
      studentGender: studentGender,
      studentGrade: classVal,
    });
  };

  const handleStartRevive = () => {
    if (!selectedLesson) return;
    const finalName = studentName || "Тони";
    // Без prefetch тук — детето ще прекара време в сцените, prefetch-нат отговор би остарял безсмислено.
    navigation.navigate("Revive", {
      lesson: selectedLesson,
      studentName: finalName,
      studentGender: studentGender,
      studentGrade: classVal,
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Text style={{ fontSize: 20 }}>🎓</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Елена Пита</Text>
          <Text style={styles.headerSub}>Изберете урок за изпитване</Text>
        </View>
        <View style={styles.pointsBadge}>
          <Text style={styles.pointsBadgeText}>⭐ {totalPoints}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Днес entry point */}
        <TouchableOpacity
          style={styles.dnesCard}
          onPress={() => navigation.navigate("Dnes", {})}
        >
          <Text style={styles.dnesCardIcon}>📅</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.dnesCardTitle}>Днес</Text>
            <Text style={styles.dnesCardSubtitle}>Виж какво предстои по график</Text>
          </View>
          <Text style={styles.dnesCardArrow}>›</Text>
        </TouchableOpacity>

        {/* Student Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>👤 За ученика</Text>

          <Text style={styles.pickerLabel}>Име</Text>
          <TextInput
            style={styles.nameInput}
            value={studentName}
            onChangeText={updateStudentName}
            placeholder="Напр. Иван или Мария"
            placeholderTextColor={colors.muted}
            maxLength={30}
blurOnSubmit={false}
returnKeyType="done"
          />

          <Text style={[styles.pickerLabel, { marginTop: spacing.md }]}>Пол</Text>
          <View style={styles.genderRow}>
            <TouchableOpacity
              style={[styles.genderBtn, studentGender === "male" && styles.genderBtnActive]}
              onPress={() => updateStudentGender("male")}
            >
              <Text style={[styles.genderText, studentGender === "male" && styles.genderTextActive]}>
                👦 Момче
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.genderBtn, studentGender === "female" && styles.genderBtnActive]}
              onPress={() => updateStudentGender("female")}
            >
              <Text style={[styles.genderText, studentGender === "female" && styles.genderTextActive]}>
                👧 Момиче
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Settings Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>⚙️ Настройки</Text>
          <Picker
            label="Клас"
            options={CLASS_OPTIONS}
            value={classVal}
            onChange={updateClassVal}
          />
          <Picker
            label="Предмет"
            options={SUBJECT_OPTIONS}
            value={subject}
            onChange={updateSubject}
          />
          <Picker
            label="Издателство"
            options={PUBLISHER_OPTIONS}
            value={publisher}
            onChange={updatePublisher}
          />
          <TouchableOpacity
            style={styles.scheduleLink}
            onPress={() => navigation.navigate("ScheduleSettings", {})}
          >
            <Text style={styles.scheduleLinkText}>⚙️ Настрой седмичен график</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.scheduleLink} onPress={handleResetPoints}>
            <Text style={styles.resetPointsText}>🔄 Занули точките</Text>
          </TouchableOpacity>
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

        {/* Start Button(s) */}
        {selectedLesson && selectedLesson.hasRevive ? (
          <View style={{ gap: 10 }}>
            <TouchableOpacity
              style={styles.startBtn}
              onPress={handleStartRevive}
              activeOpacity={0.8}
            >
              <Text style={styles.startBtnText}>📖 Оживи урока</Text>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={handleStartExam}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryBtnText}>Направо на изпит</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.startBtn, !selectedLesson && styles.startBtnDisabled]}
            onPress={handleStartExam}
            disabled={!selectedLesson}
            activeOpacity={0.8}
          >
            <Text style={styles.startBtnText}>Започни изпитването</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.primary },
  dnesCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  dnesCardIcon: { fontSize: 22, marginRight: spacing.sm },
  dnesCardTitle: { fontSize: 15, fontWeight: "700", color: colors.primaryDark },
  dnesCardSubtitle: { fontSize: 12, color: colors.primaryDark, marginTop: 2 },
  dnesCardArrow: { fontSize: 20, color: colors.primary },
  scheduleLink: { marginTop: spacing.md, alignItems: "center" },
  resetPointsText: { fontSize: 12, color: "#B23B3B" },
  pointsBadge: {
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pointsBadgeText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  scheduleLinkText: { fontSize: 12, color: colors.primary },
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
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "800" },
  headerSub: { color: "rgba(255,255,255,0.8)", fontSize: 12, marginTop: 2 },
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
  cardTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: spacing.lg },
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
  nameInput: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.background,
    fontSize: 15,
    color: colors.text,
  },
  genderRow: { flexDirection: "row", gap: spacing.sm },
  genderBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
    backgroundColor: colors.background,
  },
  genderBtnActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  genderText: { fontSize: 15, color: colors.muted, fontWeight: "600" },
  genderTextActive: { color: colors.primary },
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
  lessonCardActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  lessonNum: {
    width: 34, height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryLight,
    alignItems: "center", justifyContent: "center",
  },
  lessonNumText: { fontSize: 13, fontWeight: "800", color: colors.primaryDark },
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
  secondaryBtn: {
    borderWidth: 1.5, borderColor: colors.primary,
    borderRadius: radius.md, padding: spacing.md,
    alignItems: "center",
  },
  secondaryBtnText: { color: colors.primary, fontSize: 15, fontWeight: "700" },
  startBtnText: { color: "#fff", fontSize: 17, fontWeight: "800" },
});
