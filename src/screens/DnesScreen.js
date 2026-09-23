// src/screens/DnesScreen.js
import React, { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLessons } from "../data/lessons";
import { getSchedule, getUpcomingSubjects, ALL_SCHOOL_SUBJECTS } from "../services/schedule";
import { getCompletedLessons } from "../services/progress";
import { getTodaySnapshot, saveTodaySnapshot } from "../services/dailyTasks";
import { getSceneProgress } from "../services/sceneProgress";
import { colors, spacing, radius } from "../theme";

const WORKER_URL = "https://frosty-dawn-e989.yassen-mladenov.workers.dev";

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
          getTodaySnapshot(),
        ]);

      const classVal = savedClass || "4";
      const publisherMap = publisherMapRaw ? JSON.parse(publisherMapRaw) : {};
      setStudentInfo({
        name: savedName || "Тони",
        gender: savedGender || "male",
        classVal,
      });

      const upcoming = getUpcomingSubjects(schedule, 1);
      const assignments = { ...(snapshot ? snapshot.assignments : {}) };
      let assignmentsChanged = false;

      for (const { subject } of upcoming) {
        if (!subjectHasContent(subject)) continue; // информативните редове не се "заключват" за деня
        if (assignments[subject]) continue; // вече има фиксирана задача за днес за този предмет

        const publisher = publisherMap[subject] || "klett";
        const key = `${classVal}_${subject}_${publisher}`;
        const group = (kvIndex && kvIndex[key]) || getLessons(classVal, subject, publisher);
        const nextLesson = group && group.lessons
          ? group.lessons.find((l) => l.kvKey && !completed.includes(l.kvKey))
          : null;
        if (nextLesson) {
          assignments[subject] = nextLesson;
          assignmentsChanged = true;
        }
      }

      if (assignmentsChanged || !snapshot) {
        await saveTodaySnapshot(assignments);
      }

      const built = await Promise.all(
        upcoming.map(async ({ subject }) => {
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
  }, []);

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

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Предмети за утре</Text>
        <Text style={styles.headerSubtitle}>
          {tasks.length > 0
            ? `${tasks.filter((t) => t.done).length} от ${tasks.filter((t) => t.lesson).length} задачи готови`
            : "Нищо не предстои в графика"}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        {tasks.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>
              Или графикът е празен, или всичко предстоящо вече е завършено. Провери
              настройките на графика, или разгледай всички уроци директно.
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
  center: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  header: { padding: spacing.lg, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  headerTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
  headerSubtitle: { fontSize: 13, color: colors.muted, marginTop: 4 },
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
