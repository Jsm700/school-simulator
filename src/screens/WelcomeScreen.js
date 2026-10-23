// src/screens/WelcomeScreen.js
import React, { useState, useRef, useEffect } from "react";
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
} from "react-native";
import { Text, TextInput } from "../ui/Typography";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getTeacherResponse, lessonTopicsFor } from "../services/ai";
import { startGreetingPrefetch } from "../services/prefetch";
import { getWallet, getNewEvents } from "../services/rewards";
import { getLinkedDevice, unlinkDevice, isInChildViewFromParent, exitChildView, syncLinkedChildProfile } from "../services/deviceLink";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  CLASS_OPTIONS,
  SUBJECT_OPTIONS,
  PUBLISHER_OPTIONS,
  getSubjectsForClass,
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
import { colors, spacing, radius, subjectStyle } from "../theme";
import { getCompletedLessons } from "../services/progress";

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

export default function WelcomeScreen({ navigation, onDisconnect, onExitChildView }) {
  const [viewingFromParent, setViewingFromParent] = useState(false);

  React.useEffect(() => {
    isInChildViewFromParent().then(setViewingFromParent);
  }, []);

  const handleExitChildView = React.useCallback(async () => {
    const parentLink = await exitChildView();
    if (parentLink && onExitChildView) onExitChildView();
  }, [onExitChildView]);

  const [classVal, setClassVal] = useState("4");
  const [subject, setSubject] = useState("human_nature");
  const [publisher, setPublisher] = useState("klett");
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [kvIndex, setKvIndex] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [familyCode, setFamilyCode] = useState(null);
  const [completedKeys, setCompletedKeys] = useState([]);
  const [settingsOpen, setSettingsOpen] = useState(false);

  React.useEffect(() => {
    fetchIndex().then(idx => { if (idx) setKvIndex(idx); });
  }, []);

  const refreshPoints = React.useCallback(() => {
    getWallet().then(async (w) => {
      if (!w) return;
      setWallet(w);
      // Съобщения за ново ниво и за нова глоба — само веднъж
      const ev = await getNewEvents(w);
      if (ev.levelUp) {
        Alert.alert("🎉 Ново ниво!", `Ниво ${ev.levelUp.level} · ${ev.levelUp.name}`);
      }
      if (ev.goalMilestone) {
        const m = ev.goalMilestone;
        Alert.alert(`🎯 ${m.percent}% от целта!`, `${m.title}: ${m.saved} от ${m.cost} 🪙 в касичката. Продължавай!`);
      }
      ev.penalties.forEach((p) => {
        Alert.alert(
          `−${p.amount} точки`,
          `Домашно по ${p.subject || "предмет"} със срок ${p.due_date} не беше изпратено навреме.`
        );
      });
    });
  }, []);

  React.useEffect(() => {
    refreshPoints();
  }, [refreshPoints]);

  useFocusEffect(
    React.useCallback(() => {
      refreshPoints();
      getCompletedLessons().then(setCompletedKeys).catch(() => {});
    }, [refreshPoints])
  );


  const handleDisconnect = React.useCallback(() => {
    Alert.alert(
      "Разкачи устройството?",
      "Ще се върнеш на екрана за семеен код. Данните (точки, прогрес, домашни) остават непокътнати в облака — просто ще трябва да въведеш кода отново.",
      [
        { text: "Отказ", style: "cancel" },
        {
          text: "Разкачи",
          style: "destructive",
          onPress: async () => {
            await unlinkDevice();
            if (onDisconnect) onDisconnect();
          },
        },
      ]
    );
  }, [onDisconnect]);

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
        // Запомненият предмет може да не се учи в запомнения клас (напр. стар избор отпреди
        // филтъра по клас) — тогава се взима първият предмет от програмата на класа.
        const allowedSubjects = getSubjectsForClass(savedClass || classVal);
        let subjectToUse = savedSubject || subject;
        if (!allowedSubjects.some((s) => s.value === subjectToUse)) {
          subjectToUse = allowedSubjects[0].value;
          AsyncStorage.setItem(STORAGE_KEY_SUBJECT, subjectToUse).catch(() => {});
        }
        setSubject(subjectToUse);
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
    // Ако текущият предмет не се учи в новия клас, минава на първия от програмата му
    const allowedSubjects = getSubjectsForClass(v);
    if (!allowedSubjects.some((s) => s.value === subject)) {
      updateSubject(allowedSubjects[0].value);
    }
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
    let group = (kvIndex && kvIndex[key]) || getLessons(classVal, subject, publisher);
    // Няма уроци за избраното издателство, но за този клас и предмет има точно една група
    // (напр. физика 7 е само „Клет“) — показваме нея, вместо „уроците идват скоро“.
    if (!group && kvIndex) {
      const prefix = `${classVal}_${subject}_`;
      const keys = Object.keys(kvIndex).filter((k) => k.startsWith(prefix));
      if (keys.length === 1) group = kvIndex[keys[0]];
    }
    // Инжектира subject във всеки lesson обект — групите в index-а го знаят (през key-а),
    // но самите lesson обекти не го носят; нужен е по-надолу за точковия дневник
    if (!group || !Array.isArray(group.lessons)) return group;
    return { ...group, lessons: group.lessons.map((l) => ({ ...l, subject })) };
  })();

  // Нови полета за ученика
  const [studentName, setStudentName] = useState("");
  const [studentGender, setStudentGender] = useState("male");
  const [isLinkedChild, setIsLinkedChild] = useState(false);

  React.useEffect(() => {
    (async () => {
      // Първо link-ът (локален и бърз) — за свързано дете той е единственият източник на истина,
      // а старите AsyncStorage стойности (напр. "Тони"/male) не бива да го засенчват.
      const link = await getLinkedDevice();
      if (link && link.role === "child" && link.childName) {
        setStudentName(link.childName);
        setStudentGender(link.childGender || "male");
        setIsLinkedChild(true);
        if (link.familyCode) setFamilyCode(link.familyCode);
        // Освежаване от сървъра (напр. родителят е сменил име/пол) и синхрон на student_* ключовете
        syncLinkedChildProfile().then((p) => {
          if (p && p.name) {
            setStudentName(p.name);
            setStudentGender(p.gender || "male");
          }
        });
        return;
      }
      if (link && link.familyCode) setFamilyCode(link.familyCode);
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
      selectedLesson.kvKey || "",
      lessonTopicsFor(selectedLesson),
      []
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

  const handleStartInteractive = () => {
    if (!selectedLesson) return;
    navigation.navigate("Interactive", {
      lesson: selectedLesson,
      studentName: studentName || "Тони",
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

  const lvl = wallet?.level;
  const riskTotal = wallet ? wallet.at_risk.reduce((s, r) => s + r.amount, 0) : 0;
  const subjMeta = subjectStyle(subject);
  const lessons = lessonGroup?.lessons || [];
  const doneCount = lessons.filter((l) => l.kvKey && completedKeys.includes(l.kvKey)).length;
  const firstName = (studentName || "").split(" ")[0];

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, selectedLesson && { paddingBottom: 150 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Хедър с поздрав */}
        <View style={styles.header}>
          <Text style={styles.headerEyebrow}>УЧКО</Text>
          <Text style={styles.headerTitle}>
            {firstName ? `Здравей, ${firstName}!` : "Здравей!"}
          </Text>
          <Text style={styles.headerSub}>Какво ще учим днес?</Text>
        </View>

        {/* Карта: ниво, точки, цел */}
        <TouchableOpacity
          style={styles.levelCard}
          onPress={() => navigation.navigate("Rewards")}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Награди и ниво"
        >
          {wallet ? (
            <>
              <View style={styles.levelTop}>
                <View style={styles.levelBadge}>
                  <Text style={styles.levelBadgeNum}>{lvl.level}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.levelName}>{lvl.name}</Text>
                  <Text style={styles.levelNext}>
                    {lvl.to == null ? "Най-високото ниво!" : `още ${lvl.remaining} до „${lvl.next_name}“`}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.muted} />
              </View>
              <View style={styles.levelTrack}>
                <View style={[styles.levelFill, { width: `${Math.round(lvl.progress * 100)}%` }]} />
              </View>
              <View style={styles.statsRow}>
                <View style={styles.statPill}>
                  <Text style={styles.statText}>⭐ {wallet.wallet}</Text>
                </View>
                <View style={styles.statPill}>
                  <Text style={styles.statText}>🪙 {wallet.tokens}</Text>
                </View>
                {wallet.can_exchange > 0 && (
                  <View style={[styles.statPill, styles.statPillHot]}>
                    <Text style={[styles.statText, { color: colors.accentDark }]}>+1 🪙 готов!</Text>
                  </View>
                )}
              </View>
              {wallet.goal ? (
                <View style={styles.goalRow}>
                  <Text style={styles.goalRowText} numberOfLines={1}>
                    🎯 {wallet.goal.title}
                  </Text>
                  <View style={styles.goalTrack}>
                    <View style={[styles.goalFill, { width: `${Math.min(100, Math.round((wallet.goal.saved / wallet.goal.cost) * 100))}%` }]} />
                  </View>
                  <Text style={styles.goalRowNums}>{wallet.goal.saved}/{wallet.goal.cost}</Text>
                </View>
              ) : wallet.goals_available > 0 ? (
                <Text style={[styles.goalRowText, { marginTop: spacing.sm }]}>🎯 Избери голяма цел ›</Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.levelNext}>Зареждам точките…</Text>
          )}
        </TouchableOpacity>

        {/* Днес / Домашни */}
        <View style={styles.tilesRow}>
          <TouchableOpacity style={[styles.tile, { backgroundColor: colors.primaryLight }]} onPress={() => navigation.navigate("Dnes", {})}>
            <Text style={styles.tileIcon}>📅</Text>
            <Text style={[styles.tileTitle, { color: colors.primaryDark }]}>Днес</Text>
            <Text style={styles.tileSub}>Какво предстои</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tile, { backgroundColor: riskTotal > 0 ? colors.dangerLight : colors.successLight }]}
            onPress={() => navigation.navigate("Homework", {})}
          >
            <Text style={styles.tileIcon}>📚</Text>
            <Text style={[styles.tileTitle, { color: riskTotal > 0 ? colors.danger : colors.success }]}>Домашни</Text>
            <Text style={[styles.tileSub, riskTotal > 0 && { color: colors.danger, fontWeight: "800" }]}>
              {riskTotal > 0 ? `⚠ −${riskTotal} в риск` : "Снимай за проверка"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Ученик (само ако устройството не е свързано като конкретно дете) */}
        {!isLinkedChild && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>👤 За ученика</Text>
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
                <Text style={[styles.genderText, studentGender === "male" && styles.genderTextActive]}>👦 Момче</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.genderBtn, studentGender === "female" && styles.genderBtnActive]}
                onPress={() => updateStudentGender("female")}
              >
                <Text style={[styles.genderText, studentGender === "female" && styles.genderTextActive]}>👧 Момиче</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Предмети — бърз избор */}
        <Text style={styles.sectionLabel}>ПРЕДМЕТ · {classVal}. КЛАС</Text>
        <View style={styles.subjectWrap}>
          {getSubjectsForClass(classVal).map((opt) => {
            const m = subjectStyle(opt.value);
            const on = opt.value === subject;
            return (
              <TouchableOpacity
                key={opt.value}
                onPress={() => updateSubject(opt.value)}
                style={[styles.subjectChip, on && { backgroundColor: m.color, borderColor: m.color }]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={opt.label}
              >
                <Text style={styles.subjectChipEmoji}>{m.emoji}</Text>
                <Text style={[styles.subjectChipText, on && { color: "#fff" }]}>{m.short}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Уроци */}
        {lessonGroup ? (
          <View style={styles.lessonsBlock}>
            <View style={styles.lessonsHead}>
              <Text style={styles.lessonsTitle}>{subjMeta.emoji} Уроци</Text>
              {lessons.length > 0 && (
                <Text style={styles.lessonsCount}>
                  {doneCount}/{lessons.length} минати
                </Text>
              )}
            </View>
            {lessons.map((lesson) => {
              const active = selectedLesson?.id === lesson.id;
              const done = !!lesson.kvKey && completedKeys.includes(lesson.kvKey);
              return (
                <TouchableOpacity
                  key={lesson.id}
                  style={[styles.lessonCard, active && { borderColor: subjMeta.color, backgroundColor: subjMeta.light }]}
                  onPress={() => setSelectedLesson(active ? null : lesson)}
                  activeOpacity={0.75}
                >
                  <View style={[styles.lessonNum, { backgroundColor: done ? colors.success : active ? subjMeta.color : subjMeta.light }]}>
                    {done ? (
                      <Ionicons name="checkmark" size={18} color="#fff" />
                    ) : (
                      <Text style={[styles.lessonNumText, { color: active ? "#fff" : subjMeta.color }]}>{lesson.id}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.lessonTitle}>{lesson.title}</Text>
                    {lesson.hasInteractive ? <Text style={styles.labTag}>🔬 с опит на живо</Text> : null}
                    {!!lesson.subtitle && <Text style={styles.lessonSub} numberOfLines={2}>{lesson.subtitle}</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View style={styles.infoBanner}>
            <Text style={{ fontSize: 18 }}>💡</Text>
            <Text style={styles.infoBannerText}>
              За тази комбинация уроците идват скоро. Провери издателството в настройките.
            </Text>
          </View>
        )}

        {/* Настройки — сгънати */}
        <TouchableOpacity style={styles.settingsToggle} onPress={() => setSettingsOpen((o) => !o)}>
          <Text style={styles.settingsToggleText}>⚙️ Настройки</Text>
          <Ionicons name={settingsOpen ? "chevron-up" : "chevron-down"} size={18} color={colors.muted} />
        </TouchableOpacity>
        {settingsOpen && (
          <View style={styles.card}>
            {familyCode && (
              <View style={styles.familyCodeBox}>
                <Text style={styles.familyCodeLabel}>👪 Семеен код</Text>
                <Text style={styles.familyCodeValue}>{familyCode}</Text>
              </View>
            )}
            <Picker label="Клас" options={CLASS_OPTIONS} value={classVal} onChange={updateClassVal} />
            <Picker label="Предмет" options={getSubjectsForClass(classVal)} value={subject} onChange={updateSubject} />
            <Picker label="Издателство" options={PUBLISHER_OPTIONS} value={publisher} onChange={updatePublisher} />
            <TouchableOpacity style={styles.scheduleLink} onPress={() => navigation.navigate("ScheduleSettings", {})}>
              <Text style={styles.scheduleLinkText}>🗓️ Настрой седмичен график</Text>
            </TouchableOpacity>
            {viewingFromParent ? (
              <TouchableOpacity style={styles.scheduleLink} onPress={handleExitChildView}>
                <Text style={styles.scheduleLinkText}>👪 Обратно към родителски изглед</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.scheduleLink} onPress={handleDisconnect}>
                <Text style={styles.resetPointsText}>🔌 Разкачи устройството</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        {viewingFromParent && !settingsOpen && (
          <TouchableOpacity style={styles.scheduleLink} onPress={handleExitChildView}>
            <Text style={styles.scheduleLinkText}>👪 Обратно към родителски изглед</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Долна лента с действията за избрания урок */}
      {selectedLesson && (
        <View style={styles.actionBar}>
          <Text style={styles.actionTitle} numberOfLines={1}>{selectedLesson.title}</Text>
          {selectedLesson.hasInteractive && (
            <TouchableOpacity style={styles.labBtn} onPress={handleStartInteractive} activeOpacity={0.85}>
              <Text style={styles.labBtnText}>🔬 Опит на живо</Text>
            </TouchableOpacity>
          )}
          {selectedLesson.hasRevive ? (
            <View style={styles.actionRow}>
              <TouchableOpacity style={[styles.startBtn, { flex: 1.3 }]} onPress={handleStartRevive} activeOpacity={0.85}>
                <Text style={styles.startBtnText}>📖 Оживи урока</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.secondaryBtn, { flex: 1 }]} onPress={handleStartExam} activeOpacity={0.85}>
                <Text style={styles.secondaryBtnText}>Изпит</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.startBtn} onPress={handleStartExam} activeOpacity={0.85}>
              <Text style={styles.startBtnText}>Започни изпитването</Text>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.primaryDark },
  scroll: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingBottom: spacing.xl },
  header: {
    backgroundColor: colors.primaryDark,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: 56,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerEyebrow: { color: "#9DB8EA", fontSize: 12, fontWeight: "800", letterSpacing: 2.5 },
  headerTitle: { color: "#fff", fontSize: 26, fontFamily: "display", fontWeight: "800", marginTop: 4 },
  headerSub: { color: "#C9D8F5", fontSize: 15, marginTop: 2 },

  levelCard: {
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    marginTop: -40,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#17233B",
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  levelTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  levelBadge: {
    width: 46, height: 46, borderRadius: 14,
    backgroundColor: colors.energy,
    alignItems: "center", justifyContent: "center",
  },
  levelBadgeNum: { fontSize: 22, fontFamily: "display", fontWeight: "800", color: colors.ink },
  levelName: { fontSize: 17, fontFamily: "display", fontWeight: "700", color: colors.text },
  levelNext: { fontSize: 13, color: colors.muted, marginTop: 1 },
  levelTrack: { height: 10, borderRadius: 5, backgroundColor: colors.energyLight, overflow: "hidden", marginTop: spacing.md },
  levelFill: { height: 10, borderRadius: 5, backgroundColor: colors.energy },
  statsRow: { flexDirection: "row", gap: 8, marginTop: spacing.md, flexWrap: "wrap" },
  statPill: { backgroundColor: colors.background, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 5 },
  statPillHot: { backgroundColor: colors.accentLight },
  statText: { fontSize: 14, fontWeight: "800", color: colors.text },
  goalRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.md },
  goalRowText: { fontSize: 13, fontWeight: "700", color: colors.text, maxWidth: "45%" },
  goalTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.accentLight, overflow: "hidden" },
  goalFill: { height: 8, borderRadius: 4, backgroundColor: colors.accent },
  goalRowNums: { fontSize: 12, fontWeight: "800", color: colors.accentDark },

  tilesRow: { flexDirection: "row", gap: spacing.md, marginHorizontal: spacing.lg, marginTop: spacing.lg },
  tile: { flex: 1, borderRadius: radius.lg, padding: spacing.lg, minHeight: 104 },
  tileIcon: { fontSize: 26 },
  tileTitle: { fontSize: 16, fontFamily: "display", fontWeight: "700", marginTop: 6 },
  tileSub: { fontSize: 13, color: colors.muted, marginTop: 2 },

  sectionLabel: {
    fontSize: 12, fontWeight: "800", color: colors.muted, letterSpacing: 1.2,
    marginHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.sm,
  },
  subjectWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginHorizontal: spacing.lg },
  subjectChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, minHeight: 44,
    borderRadius: radius.full, backgroundColor: colors.card,
    borderWidth: 1.5, borderColor: colors.border,
  },
  subjectChipEmoji: { fontSize: 16 },
  subjectChipText: { fontSize: 15, fontWeight: "700", color: colors.text },

  lessonsBlock: { marginHorizontal: spacing.lg, marginTop: spacing.lg },
  lessonsHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: spacing.sm },
  lessonsTitle: { fontSize: 18, fontFamily: "display", fontWeight: "700", color: colors.text },
  lessonsCount: { fontSize: 13, fontWeight: "700", color: colors.success },
  lessonCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radius.lg, padding: spacing.md,
    marginBottom: spacing.sm, backgroundColor: colors.card,
  },
  lessonNum: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  lessonNumText: { fontSize: 14, fontWeight: "900" },
  lessonTitle: { fontSize: 15, fontWeight: "800", color: colors.text },
  lessonSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  labTag: { fontSize: 12, fontWeight: "900", color: "#9A6B00", marginTop: 2 },
  reviveTag: { fontSize: 16 },

  infoBanner: {
    backgroundColor: colors.warningLight, borderWidth: 1, borderColor: colors.warning,
    borderRadius: radius.md, padding: spacing.md, flexDirection: "row", gap: spacing.sm,
    alignItems: "flex-start", marginHorizontal: spacing.lg, marginTop: spacing.lg,
  },
  infoBannerText: { flex: 1, fontSize: 13, color: "#633806" },

  settingsToggle: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginHorizontal: spacing.lg, marginTop: spacing.xl, paddingVertical: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  settingsToggleText: { fontSize: 15, fontWeight: "700", color: colors.muted },
  card: {
    backgroundColor: colors.card, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border,
    padding: spacing.xl, marginHorizontal: spacing.lg, marginTop: spacing.md,
  },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.text, marginBottom: spacing.lg },
  scheduleLink: { marginTop: spacing.md, alignItems: "center", paddingVertical: 6 },
  scheduleLinkText: { fontSize: 14, color: colors.primary, fontWeight: "700" },
  resetPointsText: { fontSize: 14, color: colors.danger, fontWeight: "700" },
  familyCodeBox: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: colors.primaryLight, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  familyCodeLabel: { fontSize: 14, color: colors.primaryDark },
  familyCodeValue: { fontSize: 16, fontWeight: "800", color: colors.primaryDark, letterSpacing: 2 },
  pickerGroup: { marginBottom: spacing.md },
  pickerLabel: {
    fontSize: 12, fontWeight: "800", color: colors.muted, textTransform: "uppercase",
    letterSpacing: 0.8, marginBottom: spacing.xs,
  },
  pickerBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.md, backgroundColor: colors.background,
  },
  pickerBtnText: { fontSize: 15, color: colors.text, flex: 1 },
  dropdown: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    backgroundColor: colors.card, marginTop: 4, overflow: "hidden",
  },
  dropdownItem: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: spacing.md, borderBottomWidth: 0.5, borderBottomColor: colors.border,
  },
  dropdownItemActive: { backgroundColor: colors.primaryLight },
  dropdownText: { fontSize: 15, color: colors.text },
  dropdownTextActive: { color: colors.primary, fontWeight: "700" },
  nameInput: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.md, backgroundColor: colors.background, fontSize: 15, color: colors.text,
  },
  genderRow: { flexDirection: "row", gap: spacing.sm },
  genderBtn: {
    flex: 1, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.md, alignItems: "center", backgroundColor: colors.background,
  },
  genderBtnActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  genderText: { fontSize: 15, color: colors.muted, fontWeight: "700" },
  genderTextActive: { color: colors.primary },

  actionBar: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    backgroundColor: colors.card,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xl,
    shadowColor: "#17233B", shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  actionTitle: { fontSize: 14, fontWeight: "800", color: colors.muted, marginBottom: spacing.sm, textAlign: "center" },
  actionRow: { flexDirection: "row", gap: spacing.sm },
  labBtn: {
    backgroundColor: colors.energyLight, borderWidth: 2, borderColor: colors.energy,
    borderRadius: radius.lg, minHeight: 48, alignItems: "center", justifyContent: "center",
    marginBottom: spacing.sm,
  },
  labBtnText: { color: colors.ink, fontSize: 16, fontWeight: "900" },
  startBtn: {
    backgroundColor: colors.accent, borderRadius: radius.lg, minHeight: 54,
    paddingHorizontal: spacing.lg, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: spacing.sm,
  },
  startBtnText: { color: "#fff", fontSize: 17, fontWeight: "900" },
  secondaryBtn: {
    borderWidth: 2, borderColor: colors.primary, borderRadius: radius.lg, minHeight: 54,
    alignItems: "center", justifyContent: "center", backgroundColor: colors.card,
  },
  secondaryBtnText: { color: colors.primary, fontSize: 16, fontWeight: "900" },
});
