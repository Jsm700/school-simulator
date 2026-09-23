// src/screens/ParentDashboardScreen.js
// Родителското устройство пада тук вместо в обикновеното меню за уроци —
// родителят не взима уроци, той наблюдава. Превключва между децата в
// семейството и вижда точки, дневник, и статуса на днешните задачи за всяко.

import React, { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, radius } from "../theme";
import { getLinkedDevice, listChildren, BACKEND_URL } from "../services/deviceLink";
import { ALL_SCHOOL_SUBJECTS } from "../services/schedule";

const subjectLabelOf = (value) => (ALL_SCHOOL_SUBJECTS.find((s) => s.value === value) || {}).label || value;

async function fetchChildData(childId) {
  const today = new Date().toISOString().slice(0, 10);
  const [pointsRes, progressRes, tasksRes] = await Promise.all([
    fetch(`${BACKEND_URL}/children/${childId}/points`).then((r) => r.json()).catch(() => ({ total: 0, log: [] })),
    fetch(`${BACKEND_URL}/children/${childId}/progress`).then((r) => r.json()).catch(() => ({ completed_kv_keys: [] })),
    fetch(`${BACKEND_URL}/children/${childId}/daily-tasks?date=${today}`).then((r) => r.json()).catch(() => ({ assignments: {} })),
  ]);
  return {
    total: pointsRes.total || 0,
    log: pointsRes.log || [],
    completed: progressRes.completed_kv_keys || [],
    todayAssignments: tasksRes.assignments || {},
  };
}

export default function ParentDashboardScreen() {
  const [loading, setLoading] = useState(true);
  const [children, setChildren] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [childData, setChildData] = useState(null);
  const [loadingChild, setLoadingChild] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const link = await getLinkedDevice();
    if (!link || !link.familyId) {
      setLoading(false);
      return;
    }
    try {
      const list = await listChildren(link.familyId);
      setChildren(list);
      if (list.length > 0) setSelectedId(list[0].id);
    } catch (e) {
      console.error("ParentDashboard load children error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selectedId) return;
    setLoadingChild(true);
    fetchChildData(selectedId).then(setChildData).finally(() => setLoadingChild(false));
  }, [selectedId]);

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (children.length === 0) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.emptyText}>Няма добавени деца в това семейство.</Text>
      </SafeAreaView>
    );
  }

  const selectedChild = children.find((c) => c.id === selectedId);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>👪 Родителски изглед</Text>
      </View>

      <View style={styles.childSwitcher}>
        {children.map((c) => (
          <TouchableOpacity
            key={c.id}
            style={[styles.childChip, selectedId === c.id && styles.childChipActive]}
            onPress={() => setSelectedId(c.id)}
          >
            <Text style={[styles.childChipText, selectedId === c.id && styles.childChipTextActive]}>
              {c.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loadingChild || !childData ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>⭐ Общо точки</Text>
            <Text style={styles.pointsTotal}>{childData.total}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>📅 Днес</Text>
            {Object.keys(childData.todayAssignments).length === 0 ? (
              <Text style={styles.mutedText}>Няма зададени задачи за днес още.</Text>
            ) : (
              Object.entries(childData.todayAssignments).map(([subject, lesson]) => {
                const done = childData.completed.includes(lesson.kvKey || lesson.kv_key);
                return (
                  <View key={subject} style={styles.taskRow}>
                    <Text style={{ fontSize: 16 }}>{done ? "✅" : "⏳"}</Text>
                    <View style={{ flex: 1, marginLeft: spacing.sm }}>
                      <Text style={styles.taskSubject}>{subjectLabelOf(subject)}</Text>
                      <Text style={styles.taskTitle}>{lesson.title}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>📖 Дневник на точките</Text>
            {childData.log.length === 0 ? (
              <Text style={styles.mutedText}>Още няма записи.</Text>
            ) : (
              childData.log.slice(0, 20).map((entry, idx) => (
                <View key={idx} style={styles.logRow}>
                  <Text style={styles.logDate}>{entry.date}</Text>
                  <Text style={styles.logTitle} numberOfLines={1}>
                    {entry.lesson_title || entry.lesson_key}
                    {entry.subject ? ` · ${subjectLabelOf(entry.subject)}` : ""}
                  </Text>
                  <Text style={styles.logPoints}>+{entry.points}</Text>
                </View>
              ))
            )}
          </View>

          <Text style={styles.footerNote}>
            Завършени уроци общо: {childData.completed.length}
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  emptyText: { fontSize: 15, color: colors.muted, textAlign: "center" },
  header: { padding: spacing.lg, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  headerTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
  childSwitcher: {
    flexDirection: "row", flexWrap: "wrap", gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  childChip: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.full,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.lg,
  },
  childChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  childChipText: { color: colors.muted, fontSize: 14, fontWeight: "600" },
  childChipTextActive: { color: colors.primaryDark },
  card: {
    backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 0.5,
    borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md,
  },
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.text, marginBottom: spacing.sm },
  pointsTotal: { fontSize: 32, fontWeight: "800", color: colors.primaryDark },
  mutedText: { fontSize: 13, color: colors.muted },
  taskRow: { flexDirection: "row", alignItems: "center", marginBottom: spacing.sm },
  taskSubject: { fontSize: 13, fontWeight: "700", color: colors.text },
  taskTitle: { fontSize: 12, color: colors.muted },
  logRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: spacing.xs, borderBottomWidth: 0.5, borderBottomColor: colors.border,
  },
  logDate: { fontSize: 11, color: colors.muted, width: 70 },
  logTitle: { fontSize: 13, color: colors.text, flex: 1, marginHorizontal: spacing.sm },
  logPoints: { fontSize: 13, fontWeight: "700", color: colors.success },
  footerNote: { fontSize: 12, color: colors.muted, textAlign: "center", marginTop: spacing.sm },
});
