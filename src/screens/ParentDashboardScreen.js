// src/screens/ParentDashboardScreen.js
// Родителското устройство пада тук вместо в обикновеното меню за уроци —
// родителят не взима уроци, той наблюдава. Превключва между децата в
// семейството и вижда точки, дневник, и статуса на днешните задачи за всяко.

import React, { useState, useEffect, useCallback } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Linking, Alert, AppState, Modal, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { colors, spacing, radius } from "../theme";
import { getLinkedDevice, listChildren, updateChild, enterChildView, BACKEND_URL } from "../services/deviceLink";
import { ALL_SCHOOL_SUBJECTS, getSubjectsForDate } from "../services/schedule";
import {
  getWallet, getRewards, resolveRewardRequest, forgivePenalty, saveFamilyRewards, saveFamilyGoals, changeGoal,
} from "../services/rewards";

const pad2 = (n) => String(n).padStart(2, "0");
const fmtDM = (d) => `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}`;
const fmtIsoDM = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${m[3]}.${m[2]}` : iso;
};
const logKindIcon = (key) => {
  if ((key || "").startsWith("notebook_")) return "📓";
  if ((key || "").startsWith("homework_")) return "📚";
  return "🎓";
};

const subjectLabelOf = (value) => (ALL_SCHOOL_SUBJECTS.find((s) => s.value === value) || {}).label || value;

const fmtEur = (v) => (Number(v) || 0).toFixed(2).replace(".", ",");

async function fetchChildData(childId) {
  const today = new Date().toISOString().slice(0, 10);
  const [pointsRes, progressRes, tasksRes, homeworkRes, statsRes, notebookRes, checksRes, scheduleRes, aiUsageRes, walletRes, rewardsRes] = await Promise.all([
    fetch(`${BACKEND_URL}/children/${childId}/points`).then((r) => r.json()).catch(() => ({ total: 0, log: [] })),
    fetch(`${BACKEND_URL}/children/${childId}/progress`).then((r) => r.json()).catch(() => ({ completed_kv_keys: [] })),
    fetch(`${BACKEND_URL}/children/${childId}/daily-tasks?date=${today}`).then((r) => r.json()).catch(() => ({ assignments: {} })),
    fetch(`${BACKEND_URL}/children/${childId}/homework?done=false`).then((r) => r.json()).catch(() => []),
    fetch(`${BACKEND_URL}/children/${childId}/homework/stats`).then((r) => r.json()).catch(() => null),
    fetch(`${BACKEND_URL}/children/${childId}/notebook`).then((r) => r.json()).catch(() => []),
    fetch(`${BACKEND_URL}/children/${childId}/homework/checks?limit=15`).then((r) => r.json()).catch(() => []),
    fetch(`${BACKEND_URL}/children/${childId}/schedule`).then((r) => r.json()).catch(() => ({})),
    fetch(`${BACKEND_URL}/children/${childId}/ai-usage`).then((r) => r.json()).catch(() => null),
    getWallet(childId),
    getRewards(childId).catch(() => null),
  ]);
  return {
    total: pointsRes.total || 0,
    log: pointsRes.log || [],
    completed: progressRes.completed_kv_keys || [],
    todayAssignments: tasksRes.assignments || {},
    todaySubjects: getSubjectsForDate((scheduleRes && typeof scheduleRes === "object" && !Array.isArray(scheduleRes)) ? scheduleRes : {}, new Date()),
    homework: Array.isArray(homeworkRes) ? homeworkRes : [],
    homeworkStats: statsRes,
    notebook: Array.isArray(notebookRes) ? notebookRes : [],
    checks: Array.isArray(checksRes) ? checksRes : [],
    aiUsage: (aiUsageRes && Array.isArray(aiUsageRes.by_kind)) ? aiUsageRes : null,
    wallet: walletRes,
    rewards: rewardsRes,
  };
}

async function archiveHomework(childId, homeworkId) {
  const res = await fetch(`${BACKEND_URL}/children/${childId}/homework/${homeworkId}/archive`, { method: "POST" });
  if (!res.ok) throw new Error(`archive -> ${res.status}`);
}

async function archiveHomeworkBulk(childId, scope) {
  const res = await fetch(`${BACKEND_URL}/children/${childId}/homework/archive-bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope }),
  });
  if (!res.ok) throw new Error(`archive-bulk -> ${res.status}`);
  return res.json();
}

async function toggleHomeworkDone(childId, homeworkId) {
  await fetch(`${BACKEND_URL}/children/${childId}/homework/${homeworkId}/toggle-done`, { method: "POST" });
}

export default function ParentDashboardScreen({ onEnterChildView }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [children, setChildren] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [childData, setChildData] = useState(null);
  const [loadingChild, setLoadingChild] = useState(false);
  const [link, setLink] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editGender, setEditGender] = useState("male");
  const [savingEdit, setSavingEdit] = useState(false);
  const [switchingChild, setSwitchingChild] = useState(false);
  const [checkDetail, setCheckDetail] = useState(null); // { loading, data }
  const [shopDraft, setShopDraft] = useState(null); // null = магазинът не се редактира; иначе [{id,title,cost}]
  const [goalDraft, setGoalDraft] = useState(null); // същото за големите цели
  const [goalPick, setGoalPick] = useState(false); // показва списъка за смяна на целта на детето

  const load = useCallback(async () => {
    setLoading(true);
    const l = await getLinkedDevice();
    setLink(l);
    if (!l || !l.familyId) {
      setLoading(false);
      return;
    }
    try {
      const list = await listChildren(l.familyId);
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
    setGoalPick(false);
    setLoadingChild(true);
    fetchChildData(selectedId).then(setChildData).finally(() => setLoadingChild(false));
  }, [selectedId]);

  // Връщане в приложението (напр. от браузъра след импорт на домашни) — опреснява данните сам
  useEffect(() => {
    if (!selectedId) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") fetchChildData(selectedId).then(setChildData).catch(() => {});
    });
    return () => sub.remove();
  }, [selectedId]);

  const openCheckDetail = useCallback(async (checkId) => {
    if (!selectedId) return;
    setCheckDetail({ loading: true, data: null });
    try {
      const res = await fetch(`${BACKEND_URL}/children/${selectedId}/homework/checks/${checkId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCheckDetail({ loading: false, data: await res.json() });
    } catch (e) {
      console.error("openCheckDetail error:", e);
      setCheckDetail(null);
      Alert.alert("Грешка", "Не успях да заредя проверката. Опитай пак.");
    }
  }, [selectedId]);

  const handleToggleHomework = useCallback(async (homeworkId) => {
    if (!selectedId) return;
    // Оптимистично премахваме от списъка веднага, после потвърждаваме със сървъра
    setChildData((prev) => prev && { ...prev, homework: prev.homework.filter((h) => h.id !== homeworkId) });
    try {
      await toggleHomeworkDone(selectedId, homeworkId);
    } catch (e) {
      console.error("toggle homework error:", e);
      fetchChildData(selectedId).then(setChildData); // при грешка — презареди истинското състояние
    }
  }, [selectedId]);

  const handleArchiveHomework = useCallback(async (homeworkId) => {
    if (!selectedId) return;
    setChildData((prev) => prev && { ...prev, homework: prev.homework.filter((h) => h.id !== homeworkId) });
    try {
      await archiveHomework(selectedId, homeworkId);
      fetchChildData(selectedId).then(setChildData); // освежава и статистиката
    } catch (e) {
      console.error("archive homework error:", e);
      Alert.alert("Грешка", "Не успях да архивирам домашното. Опитай пак.");
      fetchChildData(selectedId).then(setChildData);
    }
  }, [selectedId]);

  const handleArchiveBulk = useCallback((scope) => {
    if (!selectedId) return;
    const title = scope === "overdue" ? "Архивирай просрочените?" : "Архивирай всички чакащи?";
    const msg = scope === "overdue"
      ? "Всички чакащи домашни с минал срок ще се скрият от списъка и статистиката."
      : "Всички чакащи домашни ще се скрият от списъка и статистиката. Новите, които добавиш после, ще се показват нормално.";
    Alert.alert(title, msg, [
      { text: "Отказ", style: "cancel" },
      {
        text: "Архивирай",
        style: "destructive",
        onPress: async () => {
          try {
            const r = await archiveHomeworkBulk(selectedId, scope);
            const fresh = await fetchChildData(selectedId);
            setChildData(fresh);
            Alert.alert("Готово", `Архивирани: ${r.archived_count}`);
          } catch (e) {
            console.error("archive bulk error:", e);
            Alert.alert("Грешка", "Не успях да архивирам. Опитай пак.");
          }
        },
      },
    ]);
  }, [selectedId]);

  const refreshChild = useCallback(() => {
    if (selectedId) fetchChildData(selectedId).then(setChildData).catch(() => {});
  }, [selectedId]);

  const onResolveRequest = useCallback((req, action) => {
    const msg = action === "deliver"
      ? `Отбелязвам „${req.title}“ като дадена?`
      : req.kind === "goal"
        ? `Отлагаш „${req.title}“? Жетоните остават в касичката и детето може да заяви пак.`
        : `Отказваш „${req.title}“? Жетоните (${req.cost}) се връщат на детето.`;
    Alert.alert("Награда", msg, [
      { text: "Не", style: "cancel" },
      {
        text: "Да",
        onPress: async () => {
          try {
            await resolveRewardRequest(selectedId, req.id, action);
          } catch (e) {
            Alert.alert("Грешка", e.message);
          }
          refreshChild();
        },
      },
    ]);
  }, [selectedId, refreshChild]);

  const onForgive = useCallback((p) => {
    Alert.alert("Опрости глобата?", `Връщат се ${p.amount} точки (${p.subject || "домашно"}, срок ${p.due_date}).`, [
      { text: "Не", style: "cancel" },
      {
        text: "Опрости",
        onPress: async () => {
          try {
            await forgivePenalty(selectedId, p.id);
          } catch (e) {
            Alert.alert("Грешка", e.message);
          }
          refreshChild();
        },
      },
    ]);
  }, [selectedId, refreshChild]);

  const onSaveShop = useCallback(async () => {
    if (!link?.familyId || !shopDraft) return;
    const clean = shopDraft
      .map((r) => ({ ...r, title: (r.title || "").trim(), cost: parseInt(String(r.cost), 10) || 0 }))
      .filter((r) => r.title && r.cost > 0);
    try {
      await saveFamilyRewards(link.familyId, clean);
      setShopDraft(null);
      refreshChild();
    } catch (e) {
      Alert.alert("Грешка", e.message);
    }
  }, [link, shopDraft, refreshChild]);

  const onSaveGoals = useCallback(async () => {
    if (!link?.familyId || !goalDraft) return;
    const clean = goalDraft
      .map((g) => ({ ...g, title: (g.title || "").trim(), cost: parseInt(String(g.cost), 10) || 0 }))
      .filter((g) => g.title && g.cost > 0);
    try {
      await saveFamilyGoals(link.familyId, clean);
      setGoalDraft(null);
      refreshChild();
    } catch (e) {
      Alert.alert("Грешка", e.message);
    }
  }, [link, goalDraft, refreshChild]);

  const onChangeGoal = useCallback((g) => {
    const cur = childData?.rewards?.goal;
    const msg = cur
      ? `Сменяш „${cur.title}“ с „${g.title}“ (${g.cost} 🪙)? Спестените ${cur.saved} 🪙 остават в касичката.`
      : `Задаваш цел „${g.title}“ (${g.cost} 🪙)?`;
    Alert.alert("Голяма цел", msg, [
      { text: "Не", style: "cancel" },
      {
        text: "Да",
        onPress: async () => {
          try {
            await changeGoal(selectedId, g.id);
            setGoalPick(false);
          } catch (e) {
            Alert.alert("Грешка", e.message);
          }
          refreshChild();
        },
      },
    ]);
  }, [childData, selectedId, refreshChild]);

  const selectedChildForEdit = children.find((c) => c.id === selectedId);

  const startEditing = useCallback(() => {
    if (!selectedChildForEdit) return;
    setEditName(selectedChildForEdit.name);
    setEditGender(selectedChildForEdit.gender || "male");
    setEditing(true);
  }, [selectedChildForEdit]);

  const saveEdit = useCallback(async () => {
    if (!link || !selectedId || !editName.trim()) return;
    setSavingEdit(true);
    try {
      const updated = await updateChild(link.familyId, selectedId, {
        name: editName.trim(),
        gender: editGender,
      });
      setChildren((prev) => prev.map((c) => (c.id === selectedId ? { ...c, ...updated } : c)));
      setEditing(false);
    } catch (e) {
      console.error("saveEdit error:", e);
      Alert.alert("Грешка", "Не успях да запазя промените. Опитай пак.");
    } finally {
      setSavingEdit(false);
    }
  }, [link, selectedId, editName, editGender]);

  const handleEnterChildView = useCallback(() => {
    if (!link || !selectedChildForEdit) return;
    Alert.alert(
      `Влез като ${selectedChildForEdit.name}?`,
      "Устройството временно ще се превключи в детски изглед. Ще можеш да се върнеш тук през бутона в менюто на детето.",
      [
        { text: "Отказ", style: "cancel" },
        {
          text: "Влез",
          onPress: async () => {
            setSwitchingChild(true);
            try {
              await enterChildView(link, selectedChildForEdit);
              if (onEnterChildView) await onEnterChildView();
            } catch (e) {
              console.error("enterChildView error:", e);
              Alert.alert("Грешка", "Не успях да превключа. Опитай пак.");
            } finally {
              setSwitchingChild(false);
            }
          },
        },
      ]
    );
  }, [link, selectedChildForEdit, onEnterChildView]);

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
        <TouchableOpacity
          onPress={() => {
            const q = link && link.familyCode
              ? `?code=${encodeURIComponent(link.familyCode)}${selectedId ? `&child=${encodeURIComponent(selectedId)}` : ""}`
              : "";
            Linking.openURL(`${BACKEND_URL}/import${q}`);
          }}
        >
          <Text style={styles.importLink}>📷 Импортирай домашни от Школо (отваря се в браузъра)</Text>
        </TouchableOpacity>
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

      {selectedChild && (
        <>
          <View style={styles.actionsBar}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() =>
                router.push({
                  pathname: "/schedule-settings",
                  params: { childId: selectedChild.id, childName: selectedChild.name },
                })
              }
            >
              <Text style={styles.actionBtnText}>⚙️ График</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={startEditing}>
              <Text style={styles.actionBtnText}>✏️ Име/пол</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={handleEnterChildView} disabled={switchingChild}>
              <Text style={styles.actionBtnText}>
                {switchingChild ? "..." : `${selectedChild.gender === "female" ? "👧" : "👦"} Влез като ${selectedChild.name}`}
              </Text>
            </TouchableOpacity>
          </View>

          {editing && (
            <View style={styles.editCard}>
              <Text style={styles.cardTitle}>Редакция на профила</Text>
              <TextInput
                style={styles.input}
                placeholder="Име на детето"
                value={editName}
                onChangeText={setEditName}
              />
              <View style={styles.row}>
                <TouchableOpacity
                  style={[styles.pill, editGender === "male" && styles.pillActive]}
                  onPress={() => setEditGender("male")}
                >
                  <Text style={[styles.pillText, editGender === "male" && styles.pillTextActive]}>Момче</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.pill, editGender === "female" && styles.pillActive]}
                  onPress={() => setEditGender("female")}
                >
                  <Text style={[styles.pillText, editGender === "female" && styles.pillTextActive]}>Момиче</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.row}>
                <TouchableOpacity style={[styles.smallBtn, { flex: 1 }]} onPress={saveEdit} disabled={savingEdit}>
                  <Text style={styles.smallBtnText}>{savingEdit ? "Запазвам..." : "💾 Запази"}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.smallBtn, styles.cancelBtn, { flex: 1 }]}
                  onPress={() => setEditing(false)}
                >
                  <Text style={styles.smallBtnText}>Отказ</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </>
      )}

      {loadingChild || !childData ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Днес · {fmtDM(new Date())}</Text>
            {(() => {
              const assignments = childData.todayAssignments || {};
              const scheduled = childData.todaySubjects || [];
              const subjects = [...scheduled];
              Object.keys(assignments).forEach((sub) => {
                if (!subjects.includes(sub)) subjects.push(sub);
              });
              if (subjects.length === 0) {
                return <Text style={styles.mutedText}>Няма предмети в графика за днес.</Text>;
              }
              return subjects.map((subject) => {
                const lesson = assignments[subject];
                if (!lesson) {
                  const hasContent = (ALL_SCHOOL_SUBJECTS.find((s) => s.value === subject) || {}).hasContent;
                  return (
                    <View key={subject} style={[styles.taskRow, { opacity: 0.6 }]}>
                      <Text style={{ fontSize: 16 }}>{hasContent ? "⏳" : "▫️"}</Text>
                      <View style={{ flex: 1, marginLeft: spacing.sm }}>
                        <Text style={styles.taskSubject}>{subjectLabelOf(subject)}</Text>
                        <Text style={styles.mutedText}>
                          {hasContent ? "Урокът още не е зададен (детето не е отваряло „Днес“)" : "Няма уроци в приложението"}
                        </Text>
                      </View>
                    </View>
                  );
                }
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
              });
            })()}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>📚 Домашни (чакащи)</Text>
            {childData.homework.length > 0 && (
              <View style={styles.bulkRow}>
                <TouchableOpacity onPress={() => handleArchiveBulk("overdue")}>
                  <Text style={styles.scheduleLinkText}>🗄 Архивирай просрочените</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleArchiveBulk("all_pending")}>
                  <Text style={styles.scheduleLinkText}>🗄 Архивирай всички</Text>
                </TouchableOpacity>
              </View>
            )}
            {childData.homework.length === 0 ? (
              <Text style={styles.mutedText}>Няма внесени чакащи домашни.</Text>
            ) : (
              childData.homework.map((hw) => (
                <View key={hw.id} style={styles.homeworkRow}>
                  <TouchableOpacity
                    style={{ flex: 1, flexDirection: "row", alignItems: "flex-start" }}
                    onPress={() => handleToggleHomework(hw.id)}
                  >
                    <Text style={{ fontSize: 16 }}>⬜</Text>
                    <View style={{ flex: 1, marginLeft: spacing.sm }}>
                      <Text style={styles.taskSubject}>{hw.subject || "(предмет?)"}</Text>
                      {hw.due_date ? <Text style={styles.mutedText}>срок: {hw.due_date}</Text> : null}
                      <Text style={styles.homeworkText}>{hw.task_text}</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.archiveBtn} onPress={() => handleArchiveHomework(hw.id)}>
                    <Text style={{ fontSize: 16 }}>🗄</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>🧾 Последно проверени</Text>
            {childData.checks.length === 0 ? (
              <Text style={styles.mutedText}>Още няма проверени домашни.</Text>
            ) : (
              childData.checks.map((c) => (
                <TouchableOpacity key={c.id} style={styles.checkRow} onPress={() => openCheckDetail(c.id)}>
                  <Text style={{ fontSize: 16 }}>{c.passed ? "✅" : "🔁"}</Text>
                  <View style={{ flex: 1, marginLeft: spacing.sm }}>
                    <Text style={styles.taskSubject}>{c.subject || "(предмет?)"} · {fmtIsoDM((c.checked_at || "").slice(0, 10))}</Text>
                    <Text style={styles.taskTitle} numberOfLines={1}>{c.task_text}</Text>
                  </View>
                  <Text style={styles.mutedText}>›</Text>
                </TouchableOpacity>
              ))
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>🏆 Ниво, точки и награди</Text>
            {childData.wallet ? (
              <>
                <Text style={styles.taskSubject}>
                  Ниво {childData.wallet.level.level} · {childData.wallet.level.name}
                  {childData.wallet.level.to != null ? ` (до следващото: ${childData.wallet.level.remaining})` : ""}
                </Text>
                <Text style={styles.pointsTotal}>⭐ {childData.wallet.wallet}  ·  🪙 {childData.wallet.tokens}</Text>
                <Text style={styles.mutedText}>Опит общо: {childData.wallet.xp} · 1 жетон = {childData.wallet.token_price} точки</Text>

                {childData.wallet.at_risk.length > 0 && (
                  <Text style={[styles.mutedText, { color: "#A3271B", marginTop: spacing.sm }]}>
                    ⚠ В риск: {childData.wallet.at_risk.map((r) => `${r.subject || "домашно"} (срок ${r.when})`).join(", ")}
                  </Text>
                )}

                {(childData.rewards?.requests || []).filter((q) => q.status === "pending").map((q) => (
                  <View key={q.id} style={[styles.subjectRow, { marginTop: spacing.sm, alignItems: "center" }]}>
                    <Text style={[styles.taskSubject, { flex: 1 }]}>🎁 Заявка: {q.title} ({q.cost} 🪙)</Text>
                    <TouchableOpacity style={styles.smallBtn} onPress={() => onResolveRequest(q, "deliver")}>
                      <Text style={styles.smallBtnText}>Дадено</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.smallBtn, styles.cancelBtn, { marginLeft: 6 }]} onPress={() => onResolveRequest(q, "cancel")}>
                      <Text style={styles.smallBtnText}>Откажи</Text>
                    </TouchableOpacity>
                  </View>
                ))}

                {childData.wallet.penalties.filter((p) => !p.forgiven).slice(0, 5).map((p) => (
                  <View key={p.id} style={[styles.subjectRow, { marginTop: spacing.sm, alignItems: "center" }]}>
                    <Text style={[styles.taskTitle, { flex: 1 }]}>−{p.amount} · {p.subject || "домашно"}, срок {p.due_date}</Text>
                    <TouchableOpacity style={[styles.smallBtn, styles.cancelBtn]} onPress={() => onForgive(p)}>
                      <Text style={styles.smallBtnText}>Опрости</Text>
                    </TouchableOpacity>
                  </View>
                ))}

                <Text style={[styles.mutedText, { marginTop: spacing.md, marginBottom: spacing.xs }]}>🎯 Голяма цел на детето:</Text>
                {childData.rewards?.goal ? (
                  <Text style={styles.taskSubject}>
                    {childData.rewards.goal.title} · {childData.rewards.goal.saved}/{childData.rewards.goal.cost} 🪙
                    {childData.rewards.goal.status === "claimed" ? " · чака „Дадено“" : ""}
                  </Text>
                ) : (
                  <Text style={styles.taskTitle}>Още не е избрана.</Text>
                )}
                {(childData.rewards?.goals || []).length > 0 && (
                  goalPick ? (
                    <>
                      {childData.rewards.goals.map((g) => (
                        <TouchableOpacity key={g.id} style={[styles.subjectRow, { marginTop: 6 }]} onPress={() => onChangeGoal(g)}>
                          <Text style={[styles.taskTitle, { flex: 1 }]}>{g.title}</Text>
                          <Text style={styles.taskSubject}>{g.cost} 🪙 ›</Text>
                        </TouchableOpacity>
                      ))}
                      <TouchableOpacity style={[styles.smallBtn, styles.cancelBtn, { marginTop: 6 }]} onPress={() => setGoalPick(false)}>
                        <Text style={styles.smallBtnText}>Отказ</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity style={[styles.smallBtn, { marginTop: 6 }]} onPress={() => setGoalPick(true)}>
                      <Text style={styles.smallBtnText}>{childData.rewards?.goal ? "🔁 Смени целта" : "🎯 Задай цел"}</Text>
                    </TouchableOpacity>
                  )
                )}

                <Text style={[styles.mutedText, { marginTop: spacing.md, marginBottom: spacing.xs }]}>🎯 Големи цели (общи за семейството):</Text>
                {goalDraft ? (
                  <>
                    {goalDraft.map((g, idx) => (
                      <View key={g.id || `n${idx}`} style={{ flexDirection: "row", gap: 6, marginBottom: 6, alignItems: "center" }}>
                        <TextInput
                          style={[styles.input, { flex: 1, marginBottom: 0 }]}
                          value={g.title}
                          placeholder="Цел (напр. Колело)"
                          onChangeText={(t) => setGoalDraft((d) => d.map((x, i) => (i === idx ? { ...x, title: t } : x)))}
                        />
                        <TextInput
                          style={[styles.input, { width: 56, marginBottom: 0, textAlign: "center" }]}
                          value={String(g.cost)}
                          keyboardType="number-pad"
                          accessibilityLabel="Цена в жетони"
                          onChangeText={(t) => setGoalDraft((d) => d.map((x, i) => (i === idx ? { ...x, cost: t } : x)))}
                        />
                        <TouchableOpacity
                          style={[styles.smallBtn, styles.cancelBtn]}
                          onPress={() => setGoalDraft((d) => d.filter((_, i) => i !== idx))}
                          accessibilityLabel="Премахни целта"
                        >
                          <Text style={styles.smallBtnText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                    <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
                      <TouchableOpacity style={[styles.smallBtn, { flex: 1 }]} onPress={() => setGoalDraft((d) => [...d, { id: "", title: "", cost: 25 }])}>
                        <Text style={styles.smallBtnText}>+ Добави</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.smallBtn, { flex: 1 }]} onPress={onSaveGoals}>
                        <Text style={styles.smallBtnText}>💾 Запази</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.smallBtn, styles.cancelBtn, { flex: 1 }]} onPress={() => setGoalDraft(null)}>
                        <Text style={styles.smallBtnText}>Отказ</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <>
                    {(childData.rewards?.goals || []).length === 0 && (
                      <Text style={styles.taskTitle}>Няма зададени цели.</Text>
                    )}
                    {(childData.rewards?.goals || []).map((g) => (
                      <View key={g.id} style={styles.subjectRow}>
                        <Text style={styles.taskTitle}>{g.title}</Text>
                        <Text style={styles.taskSubject}>{g.cost} 🪙</Text>
                      </View>
                    ))}
                    <TouchableOpacity
                      style={[styles.smallBtn, { marginTop: spacing.sm }]}
                      onPress={() => setGoalDraft((childData.rewards?.goals || []).map((g) => ({ ...g })))}
                    >
                      <Text style={styles.smallBtnText}>✏️ Промени целите</Text>
                    </TouchableOpacity>
                  </>
                )}

                <Text style={[styles.mutedText, { marginTop: spacing.md, marginBottom: spacing.xs }]}>Магазин (общ за семейството):</Text>
                {shopDraft ? (
                  <>
                    {shopDraft.map((r, idx) => (
                      <View key={r.id || idx} style={{ flexDirection: "row", gap: 6, marginBottom: 6, alignItems: "center" }}>
                        <TextInput
                          style={[styles.input, { flex: 1, marginBottom: 0 }]}
                          value={r.title}
                          placeholder="Награда"
                          onChangeText={(t) => setShopDraft((d) => d.map((x, i) => (i === idx ? { ...x, title: t } : x)))}
                        />
                        <TextInput
                          style={[styles.input, { width: 56, marginBottom: 0, textAlign: "center" }]}
                          value={String(r.cost)}
                          keyboardType="number-pad"
                          accessibilityLabel="Цена в жетони"
                          onChangeText={(t) => setShopDraft((d) => d.map((x, i) => (i === idx ? { ...x, cost: t } : x)))}
                        />
                        <TouchableOpacity
                          style={[styles.smallBtn, styles.cancelBtn]}
                          onPress={() => setShopDraft((d) => d.filter((_, i) => i !== idx))}
                          accessibilityLabel="Премахни наградата"
                        >
                          <Text style={styles.smallBtnText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                    <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
                      <TouchableOpacity style={[styles.smallBtn, { flex: 1 }]} onPress={() => setShopDraft((d) => [...d, { id: "", title: "", cost: 1 }])}>
                        <Text style={styles.smallBtnText}>+ Добави</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.smallBtn, { flex: 1 }]} onPress={onSaveShop}>
                        <Text style={styles.smallBtnText}>💾 Запази</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.smallBtn, styles.cancelBtn, { flex: 1 }]} onPress={() => setShopDraft(null)}>
                        <Text style={styles.smallBtnText}>Отказ</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <>
                    {(childData.rewards?.rewards || []).map((r) => (
                      <View key={r.id} style={styles.subjectRow}>
                        <Text style={styles.taskTitle}>{r.title}</Text>
                        <Text style={styles.taskSubject}>{r.cost} 🪙</Text>
                      </View>
                    ))}
                    <TouchableOpacity
                      style={[styles.smallBtn, { marginTop: spacing.sm }]}
                      onPress={() => setShopDraft((childData.rewards?.rewards || []).map((r) => ({ ...r })))}
                    >
                      <Text style={styles.smallBtnText}>✏️ Промени наградите</Text>
                    </TouchableOpacity>
                  </>
                )}
              </>
            ) : (
              <Text style={styles.pointsTotal}>{childData.total}</Text>
            )}
          </View>

          {childData.homeworkStats && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>📊 Статистика на домашните</Text>
              <View style={styles.statsGrid}>
                <View style={styles.statBox}>
                  <Text style={styles.statNumber}>{childData.homeworkStats.done_this_week}</Text>
                  <Text style={styles.statLabel}>тази седмица</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statNumber}>{childData.homeworkStats.done_total}</Text>
                  <Text style={styles.statLabel}>общо готови</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={[styles.statNumber, childData.homeworkStats.overdue_count > 0 && styles.statNumberWarn]}>
                    {childData.homeworkStats.overdue_count}
                  </Text>
                  <Text style={styles.statLabel}>просрочени</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statNumber}>
                    {childData.homeworkStats.success_rate_pct != null ? `${childData.homeworkStats.success_rate_pct}%` : "—"}
                  </Text>
                  <Text style={styles.statLabel}>успех от 1-ви път</Text>
                </View>
              </View>
              {Object.keys(childData.homeworkStats.by_subject || {}).length > 0 && (
                <View style={{ marginTop: spacing.md }}>
                  <Text style={[styles.mutedText, { marginBottom: spacing.xs }]}>По предмет (готови):</Text>
                  {Object.entries(childData.homeworkStats.by_subject).map(([subj, count]) => (
                    <View key={subj} style={styles.subjectRow}>
                      <Text style={styles.taskTitle}>{subj === "(без предмет)" ? "Други / неразпознат предмет" : subj}</Text>
                      <Text style={styles.taskSubject}>{count}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {childData.aiUsage && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>💶 Разход за AI проверки · този месец</Text>
              <Text style={styles.pointsTotal}>≈ {fmtEur(childData.aiUsage.cost_eur)} €</Text>
              <Text style={styles.mutedText}>
                {childData.aiUsage.count} заявки общо за семейството (всички деца)
              </Text>
              {childData.aiUsage.by_kind.map((k) => (
                <View key={k.kind} style={styles.subjectRow}>
                  <Text style={styles.taskTitle}>{k.label} · {k.count} бр.</Text>
                  <Text style={styles.taskSubject}>{fmtEur(k.cost_eur)} €</Text>
                </View>
              ))}
              <Text style={[styles.mutedText, { marginTop: spacing.sm }]}>
                Приблизително, по цените на Anthropic. Не включва разговорите с Елена.
              </Text>
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>📓 Тетрадка</Text>
            {childData.notebook.length === 0 ? (
              <Text style={styles.mutedText}>Още няма записани термини.</Text>
            ) : (
              <>
                <Text style={styles.mutedText}>
                  {childData.notebook.length} термина записани, от които{" "}
                  {childData.notebook.filter((n) => n.has_bonus_explanation).length} с бонус обяснение
                </Text>
                {childData.notebook.slice(0, 10).map((n) => (
                  <View key={n.id} style={styles.subjectRow}>
                    <Text style={styles.taskTitle}>{n.term}</Text>
                    <Text style={{ fontSize: 12 }}>{n.has_bonus_explanation ? "✨" : ""}</Text>
                  </View>
                ))}
              </>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>📖 Дневник на точките</Text>
            {childData.log.length === 0 ? (
              <Text style={styles.mutedText}>Още няма записи.</Text>
            ) : (
              childData.log.slice(0, 20).map((entry, idx) => (
                <View key={idx} style={styles.logRow}>
                  <Text style={styles.logDate}>{fmtIsoDM(entry.date)}</Text>
                  <Text style={styles.logTitle} numberOfLines={2}>
                    {logKindIcon(entry.lesson_key)} {entry.lesson_title || entry.lesson_key}
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
      <Modal visible={!!checkDetail} animationType="slide" onRequestClose={() => setCheckDetail(null)}>
        <SafeAreaView style={styles.container}>
          <View style={styles.modalHeader}>
            <Text style={styles.headerTitle}>🧾 Проверка на домашно</Text>
            <TouchableOpacity onPress={() => setCheckDetail(null)}>
              <Text style={styles.scheduleLinkText}>✕ Затвори</Text>
            </TouchableOpacity>
          </View>
          {!checkDetail || checkDetail.loading || !checkDetail.data ? (
            <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
              <Text style={styles.taskSubject}>
                {checkDetail.data.subject || "(предмет?)"}
                {checkDetail.data.due_date ? `  ·  срок: ${checkDetail.data.due_date}` : ""}
              </Text>
              <Text style={[styles.homeworkText, { marginBottom: spacing.md }]}>{checkDetail.data.task_text}</Text>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>
                  {checkDetail.data.passed ? "✅ Прието" : "🔁 Не е прието още"}
                  {"  ·  "}{fmtIsoDM((checkDetail.data.checked_at || "").slice(0, 10))}
                </Text>
                <Text style={styles.homeworkText}>{checkDetail.data.feedback || "Няма коментар."}</Text>
              </View>

              <Text style={[styles.cardTitle, { marginTop: spacing.sm }]}>📷 Изпратено от детето</Text>
              {(checkDetail.data.images || []).length === 0 ? (
                <Text style={styles.mutedText}>Снимката не е запазена (проверката е от преди тази функция).</Text>
              ) : (
                checkDetail.data.images.map((uri, i) => (
                  <Image key={i} source={{ uri }} style={styles.checkImage} resizeMode="contain" />
                ))
              )}
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  emptyText: { fontSize: 15, color: colors.muted, textAlign: "center" },
  header: { padding: spacing.lg, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  headerTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
  importLink: { fontSize: 13, color: colors.primary, marginTop: spacing.xs },
  scheduleLink: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  scheduleLinkText: { fontSize: 13, color: colors.primary, fontWeight: "600" },
  actionsBar: {
    flexDirection: "row", flexWrap: "wrap", gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
  },
  actionBtn: {
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
    borderRadius: radius.full, paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
  },
  actionBtnText: { fontSize: 13, color: colors.primaryDark, fontWeight: "600" },
  actionsRow: {
    flexDirection: "row", flexWrap: "wrap", gap: spacing.lg,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
  },
  actionLink: {},
  editCard: {
    marginHorizontal: spacing.lg, marginBottom: spacing.md, padding: spacing.lg,
    backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 0.5, borderColor: colors.border,
  },
  input: {
    backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.md, fontSize: 15, marginBottom: spacing.md,
  },
  row: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  pill: {
    flex: 1, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.full,
    padding: spacing.sm, alignItems: "center",
  },
  pillActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  pillText: { color: colors.muted, fontSize: 14 },
  pillTextActive: { color: colors.primaryDark, fontWeight: "700" },
  smallBtn: {
    backgroundColor: colors.primaryLight, borderRadius: radius.md,
    padding: spacing.md, alignItems: "center",
  },
  cancelBtn: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  smallBtnText: { color: colors.primaryDark, fontSize: 14, fontWeight: "600" },
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
  homeworkRow: {
    flexDirection: "row", alignItems: "flex-start", paddingVertical: spacing.sm,
    borderBottomWidth: 0.5, borderBottomColor: colors.border,
  },
  checkRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm,
    borderBottomWidth: 0.5, borderBottomColor: colors.border,
  },
  modalHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    padding: spacing.lg, borderBottomWidth: 0.5, borderBottomColor: colors.border,
  },
  checkImage: { width: "100%", height: 420, marginTop: spacing.sm, backgroundColor: colors.card, borderRadius: radius.md },
  bulkRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.lg, marginBottom: spacing.sm },
  archiveBtn: { paddingLeft: spacing.md, paddingVertical: spacing.xs },
  homeworkText: { fontSize: 13, color: colors.text, marginTop: 2 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  statBox: {
    flexBasis: "47%", backgroundColor: colors.background, borderRadius: radius.sm,
    padding: spacing.md, alignItems: "center",
  },
  statNumber: { fontSize: 22, fontWeight: "800", color: colors.primaryDark },
  statNumberWarn: { color: "#B23B3B" },
  statLabel: { fontSize: 11, color: colors.muted, marginTop: 2, textAlign: "center" },
  subjectRow: {
    flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.xs,
    borderBottomWidth: 0.5, borderBottomColor: colors.border,
  },
  logRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: spacing.xs, borderBottomWidth: 0.5, borderBottomColor: colors.border,
  },
  logDate: { fontSize: 11, color: colors.muted, width: 70 },
  logTitle: { fontSize: 13, color: colors.text, flex: 1, marginHorizontal: spacing.sm },
  logPoints: { fontSize: 13, fontWeight: "700", color: colors.success },
  footerNote: { fontSize: 12, color: colors.muted, textAlign: "center", marginTop: spacing.sm },
});
