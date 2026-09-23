// src/services/dailyTasks.js
// "Днес" показва ФИКСИРАНА снимка на задачите за текущия календарен ден — веднъж
// определена коя е задачата на всеки предмет за деня, тя остава същата (само сменя
// статус на "готово"), вместо да прескача веднага към следващия урок след "Приключих".
// Нова снимка се прави автоматично на следващия календарен ден.
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY_DAILY = "daily_task_snapshot"; // { date: "YYYY-MM-DD", assignments: { subject: { lessonKey, lessonTitle } } }

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export async function getTodaySnapshot() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_DAILY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && parsed.date === todayStr()) {
      return parsed;
    }
    return null; // няма снимка за днес — трябва да се направи нова
  } catch (e) {
    console.error("dailyTasks.getTodaySnapshot error:", e);
    return null;
  }
}

export async function saveTodaySnapshot(assignments) {
  const snapshot = { date: todayStr(), assignments };
  try {
    await AsyncStorage.setItem(STORAGE_KEY_DAILY, JSON.stringify(snapshot));
  } catch (e) {
    console.error("dailyTasks.saveTodaySnapshot error:", e);
  }
  return snapshot;
}
