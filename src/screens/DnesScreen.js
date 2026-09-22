// src/screens/DnesScreen.js
import React, { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SUBJECT_OPTIONS, getLessons } from "../data/lessons";
import { getSchedule, getUpcomingSubjects } from "../services/schedule";
import { getCompletedLessons } from "../services/progress";
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

const subjectLabelOf = (value) => (SUBJECT_OPTIONS.find((s) => s.value === value) || {}).label || value;

export default function DnesScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]); // [{ subject, lesson }]
  const [studentInfo, setStudentInfo] = useState({ name: "Тони", gender: "male", classVal: "4" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [schedule, completed, kvIndex, savedName, savedGender, savedClass, publisherMapRaw] =
        await Promise.all([
          getSchedule(),
          getCompletedLessons(),
          fetchIndex(),
          AsyncStorage.getItem("student_name"),
          AsyncStorage.getItem("student_gender"),
          AsyncStorage.getItem("last_class"),
          AsyncStorage.getItem("subject_publisher_map"),
        ]);

      const classVal = savedClass || "4";
      const publisherMap = publisherMapRaw ? JSON.parse(publisherMapRaw) : {};
      setStudentInfo({
        name: savedName || "Тони",
        gender: savedGender || "male",
        classVal,
      });

      const upcoming = getUpcomingSubjects(schedule, 1);
      const built = [];

      for (const { subject } of upcoming) {
        const publisher = publisherMap[subject] || "klett";
        const key = `${classVal}_${subject}_${publisher}`;
        const group = (kvIndex && kvIndex[key]) || getLessons(classVal, subject, publisher);
        if (!group || !group.lessons) continue;
        const nextLesson = group.lessons.find(
          (l) => l.kvKey && !completed.includes(l.kvKey)
        );
        if (nextLesson) built.push({ subject, lesson: nextLesson });
      }

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
        <Text style={styles.headerTitle}>Готово за утре</Text>
        <Text style={styles.headerSubtitle}>
          {tasks.length > 0
            ? `${tasks.length} ${tasks.length === 1 ? "предмет предстои" : "предмета предстоят"}`
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
          tasks.map(({ subject, lesson }) => (
            <TouchableOpacity
              key={lesson.kvKey}
              style={styles.taskRow}
              onPress={() => openLesson(lesson)}
            >
              <View style={styles.taskIcon}>
                <Text style={{ fontSize: 16 }}>📘</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.taskTitle}>{lesson.title}</Text>
                <Text style={styles.taskSubtitle}>{subjectLabelOf(subject)}</Text>
              </View>
              <Text style={styles.taskArrow}>›</Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <View style={styles.footer}>
        {tasks.length > 0 && (
          <TouchableOpacity style={styles.primaryBtn} onPress={() => openLesson(tasks[0].lesson)}>
            <Text style={styles.primaryBtnText}>Продължи {subjectLabelOf(tasks[0].subject)}</Text>
          </TouchableOpacity>
        )}
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
  taskSubtitle: { fontSize: 12, color: colors.primaryDark, marginTop: 2 },
  taskArrow: { fontSize: 20, color: colors.muted },
  footer: { padding: spacing.lg, gap: spacing.sm },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md, alignItems: "center" },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  linkBtn: { alignItems: "center", padding: spacing.sm },
  linkBtnText: { color: colors.primary, fontSize: 13 },
});
