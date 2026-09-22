// src/services/points.js
// Точкова система — детерминирана, не AI преценка. Точков ДНЕВНИК (не само сбор),
// за да може Ясен да преглежда реално какво се е случило преди да "осребри" в джобни пари.
// Виж lesson-livening-brainstorm.md за пълния дизайн разговор.
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY_POINTS_LOG = "points_log"; // [{ date, lessonKey, subject, lessonTitle, topicsTotal, topicsCovered, points, complete }]
const STORAGE_KEY_STREAK = "streak_data"; // { lastActiveDate: "YYYY-MM-DD", currentStreak: N }

const POINTS_PER_TOPIC = 10;
const COMPLETION_BONUS = 5;
const STREAK_POINTS_PER_DAY = 2;
const STREAK_MAX_BONUS = 20; // таван, за да не расте безкрайно

function todayStr(date = new Date()) {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function getPointsLog() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_POINTS_LOG);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("points.getPointsLog error:", e);
    return [];
  }
}

export async function getTotalPoints() {
  const log = await getPointsLog();
  return log.reduce((sum, entry) => sum + (entry.points || 0), 0);
}

export async function getStreak() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_STREAK);
    return raw ? JSON.parse(raw) : { lastActiveDate: null, currentStreak: 0 };
  } catch (e) {
    console.error("points.getStreak error:", e);
    return { lastActiveDate: null, currentStreak: 0 };
  }
}

// Обновява стрийка САМО веднъж на календарен ден (няколко урока в един ден не го дублират).
// Връща { streakPoints, currentStreak } — streakPoints е 0, ако денят вече е броен.
async function updateStreak() {
  const today = todayStr();
  const streak = await getStreak();

  if (streak.lastActiveDate === today) {
    return { streakPoints: 0, currentStreak: streak.currentStreak };
  }

  const yesterday = todayStr(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const newStreak = streak.lastActiveDate === yesterday ? streak.currentStreak + 1 : 1;

  await AsyncStorage.setItem(
    STORAGE_KEY_STREAK,
    JSON.stringify({ lastActiveDate: today, currentStreak: newStreak })
  );

  const streakPoints = Math.min(newStreak * STREAK_POINTS_PER_DAY, STREAK_MAX_BONUS);
  return { streakPoints, currentStreak: newStreak };
}

// Награждава точки за завършен/прескочен урок. topicsCovered/topicsTotal определят
// пропорцията; ако е 100%, добавя бонус за завършване. Стрийк бонус се добавя отделно,
// само веднъж на календарен ден.
export async function awardLessonPoints({ lessonKey, subject, lessonTitle, topicsTotal, topicsCovered }) {
  const safeTotal = Math.max(1, topicsTotal || 1);
  const safeCovered = Math.max(0, Math.min(topicsCovered ?? safeTotal, safeTotal));
  const complete = safeCovered >= safeTotal;

  const basePoints = Math.round((safeCovered / safeTotal) * safeTotal * POINTS_PER_TOPIC);
  const bonus = complete ? COMPLETION_BONUS : 0;
  const { streakPoints, currentStreak } = await updateStreak();
  const totalPoints = basePoints + bonus + streakPoints;

  const entry = {
    date: todayStr(),
    lessonKey,
    subject,
    lessonTitle,
    topicsTotal: safeTotal,
    topicsCovered: safeCovered,
    complete,
    points: totalPoints,
  };

  try {
    const log = await getPointsLog();
    log.push(entry);
    await AsyncStorage.setItem(STORAGE_KEY_POINTS_LOG, JSON.stringify(log));
  } catch (e) {
    console.error("points.awardLessonPoints save error:", e);
  }

  return { ...entry, currentStreak };
}

export async function resetPoints() {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY_POINTS_LOG);
    await AsyncStorage.removeItem(STORAGE_KEY_STREAK);
  } catch (e) {
    console.error("points.resetPoints error:", e);
  }
}
