// src/screens/DnesScreen.js
import React, { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLessons } from "../data/lessons";
import { getSchedule, getSubjectsForDate, ALL_SCHOOL_SUBJECTS } from "../services/schedule";
import { getCompletedLessons } from "../services/progress";
import { getSnapshotForDate, saveSnapshotForDate } from "../services/dailyTasks";
import { getSceneProgress } from "../services/sceneProgress";
import { colors, spacing, radius } from "../theme";

const WORKER_URL = "https://frosty-dawn-e989.yassen-mladenov.workers.dev";

const WEEKDAY_FULL = ["Пон", "Вт", "Ср", "Чет", "Пет", "Съб", "Нед"]; // индекс 0=Пон

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function isToday(date) {
  const now = new Date();
  return date.toDateString() === now.toDateString();
}

function isTomorrow(date) {
  return date.toDateString() === addDays(new Date(), 1).toDateString();
}

function formatDateLabel(date) {
  const weekday = WEEKDAY_FULL[(date.getDay() + 6) % 7]; // getDay: 0=Нед -> искаме 0=Пон
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  if (isToday(date)) return `Днес, ${weekday} ${dd}.${mm}`;
  if (isTomorrow(date)) return `Утре, ${weekday} ${dd}.${mm}`;
  return `${weekday}, ${dd}.${mm}`;
}

async function fetchIndex() {
  try {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "kv_get", key: "index" }),
    });
    const data = await res.json();
    return data.value ? JSON.parse(data.value) : null;
  } catch (e) {
    return null;
  }
}

const subjectLabelOf = (value) => (ALL_SCHOOL_SUBJECTS.find((s) => s.value === value) || {}).label || value;
const subjectHasContent = (value) => !!(ALL_SCHOOL_SUBJECTS.find((s) => s.value === value) || {}).hasContent;

export default function DnesScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => addDays(new Date(), 1)); // по подразбиране: утре, както преди
  const [tasks, setTasks] = useState([]); // [{ subject, lesson }]
  const [studentInfo, setStudentInfo] = useState({ name: "Тони", gender: "male", classVal: "4" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [schedule, completed, kvIndex, savedName, savedGender, savedClass, publisherMapRaw, snapshot] =
        await Promise.all([
          getSchedule(),
          getCompletedLessons(),
          fetchIndex(),
          AsyncStorage.getItem("student_name"),
          AsyncStorage.getItem("student_gender"),
          AsyncStorage.getItem("last_class"),
          AsyncStorage.getItem("subject_publisher_map"),
          getSnapshotForDate(selectedDate),
        ]);

      const classVal = savedClass || "4";
      const publisherMap = publisherMapRaw ? JSON.parse(publisherMapRaw) : {};
      setStudentInfo({
        name: savedName || "Тони",
        gender: savedGender || "male",
        classVal,
      });

      const subjectsForDay = getSubjectsForDate(schedule, selectedDate);
      const assignments = { ...(snapshot ? snapshot.assignments : {}) };
      let assignmentsChanged = false;

      for (const subject of subjectsForDay) {
        if (!subjectHasContent(subject)) continue; // информативните редове не се "заключват" за деня
        if (assignments[subject]) continue; // вече има фиксирана задача за тази дата за този предмет

        const publisher = publisherMap[subject] || "klett";
        const key = `${classVal}_${subject}_${publisher}`;
        const group = (kvIndex && kvIndex[key]) || getLessons(classVal, subject, publisher);
        const nextLesson = group && group.lessons
          ? group.lessons.find((l) => l.kvKey && !completed.includes(l.kvKey))
          : null;
        if (nextLesson) {
          assignments[subject] = { ...nextLesson, subject };
          assignmentsChanged = true;
        }
      }

      if (assignmentsChanged || !snapshot) {
        await saveSnapshotForDate(selectedDate, assignments);
      }

      const built = await Promise.all(
        subjectsForDay.map(async (subject) => {
          if (!subjectHasContent(subject)) return { subject, lesson: null, done: false, sceneProgress: null };
          const lesson = assignments[subject] || null;
          const done = lesson ? completed.includes(lesson.kvKey) : false;
          const sceneProgress =
            lesson && !done && lesson.hasRevive ? await getSceneProgress(lesson.kvKey) : null;
          return { subject, lesson, done, sceneProgress };
        })
      );

      setTasks(built);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    load();
  }, [load]);

  const openLesson = useCallback(
    (lesson) => {
      const params = {
        lesson,
        studentName: studentInfo.name,
        studentGender: studentInfo.gender,
        studentGrade: studentInfo.classVal,
      };
      if (lesson.hasRevive) {
        navigation.navigate("Revive", params);
      } else {
        navigation.navigate("Quiz", params);
      }
    },
    [navigation, studentInfo]
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.dateNav}>
          <TouchableOpacity
            style={styles.dateNavBtn}
            onPress={() => setSelectedDate((d) => addDays(d, -1))}
            disabled={isToday(selectedDate) || loading}
          >
            <Text style={[styles.dateNavArrow, (isToday(selectedDate) || loading) && styles.dateNavArrowDisabled]}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{formatDateLabel(selectedDate)}</Text>
          <TouchableOpacity
            style={styles.dateNavBtn}
            onPress={() => setSelectedDate((d) => addDays(d, 1))}
            disabled={loading}
          >
            <Text style={styles.dateNavArrow}>›</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.headerSubtitle}>
          {tasks.length > 0
            ? `${tasks.filter((t) => t.done).length} от ${tasks.filter((t) => t.lesson).length} задачи готови`
            : "Нищо не предстои в графика за тази дата"}
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
          {tasks.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>
                Или графикът е празен за тази дата, или всичко вече е завършено. Пробвай
                следващ ден със стрелката горе, или разгледай всички уроци директно.
              </Text>
            </View>
          ) : (
            tasks.map(({ subject, lesson, done, sceneProgress }, idx) =>
              lesson ? (
                <TouchableOpacity
                  key={lesson.kvKey}
                  style={[styles.taskRow, done && styles.taskRowDone]}
                  onPress={() => (done ? null : openLesson(lesson))}
                  disabled={done}
                >
                  <View style={[styles.taskIcon, done && styles.taskIconDone]}>
                    <Text style={{ fontSize: 16 }}>{done ? "✅" : "📘"}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.taskTitle, done && styles.taskTitleDone]}>
                      {subjectLabelOf(subject)}
                    </Text>
                    <Text style={done ? styles.taskSubtitleMuted : styles.taskSubtitle}>
                      {done
                        ? "Готово"
                        : sceneProgress
                        ? `${lesson.title} · сцена ${sceneProgress.sceneIndex + 1}/${sceneProgress.total}`
                        : lesson.title}
                    </Text>
                  </View>
                  {!done && <Text style={styles.taskArrow}>›</Text>}
                </TouchableOpacity>
              ) : (
                <View key={`info-${subject}-${idx}`} style={[styles.taskRow, styles.taskRowInfo]}>
                  <View style={styles.taskIcon}>
                    <Text style={{ fontSize: 16 }}>🗓️</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.taskTitle}>{subjectLabelOf(subject)}</Text>
                    <Text style={styles.taskSubtitleMuted}>Предстои — все още няма уроци тук</Text>
                  </View>
                </View>
              )
            )
          )}
        </ScrollView>
      )}

      <View style={styles.footer}>
        {(() => {
          const firstActionable = tasks.find((t) => t.lesson && !t.done);
          return firstActionable ? (
            <TouchableOpacity style={styles.primaryBtn} onPress={() => openLesson(firstActionable.lesson)}>
              <Text style={styles.primaryBtnText}>Продължи {subjectLabelOf(firstActionable.subject)}</Text>
            </TouchableOpacity>
          ) : null;
        })()}
        <TouchableOpacity style={styles.linkBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.linkBtnText}>Разгледай всички уроци</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { padding: spacing.lg, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  dateNav: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  dateNavBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  dateNavArrow: { fontSize: 22, color: colors.primary, fontWeight: "700" },
  dateNavArrowDisabled: { color: colors.border },
  headerTitle: { fontSize: 18, fontWeight: "700", color: colors.text, textAlign: "center", minWidth: 160 },
  headerSubtitle: { fontSize: 13, color: colors.muted, marginTop: 4, textAlign: "center" },
  emptyBox: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.lg, borderWidth: 0.5, borderColor: colors.border },
  emptyText: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  taskIcon: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.primaryLight,
    alignItems: "center", justifyContent: "center",
    marginRight: spacing.sm,
  },
  taskTitle: { fontSize: 14, fontWeight: "600", color: colors.text },
  taskTitleDone: { textDecorationLine: "line-through", color: colors.muted },
  taskSubtitle: { fontSize: 12, color: colors.primaryDark, marginTop: 2 },
  taskSubtitleMuted: { fontSize: 12, color: colors.muted, marginTop: 2 },
  taskRowInfo: { opacity: 0.75, borderStyle: "dashed" },
  taskRowDone: { opacity: 0.6 },
  taskIconDone: { backgroundColor: colors.successLight },
  taskArrow: { fontSize: 20, color: colors.muted },
  footer: { padding: spacing.lg, gap: spacing.sm },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md, alignItems: "center" },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  linkBtn: { alignItems: "center", padding: spacing.sm },
  linkBtnText: { color: colors.primary, fontSize: 13 },
});
