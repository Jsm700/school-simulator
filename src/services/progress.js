// src/services/progress.js
// Централизирано проследяване кои уроци детето е завършило — основата,
// върху която стъпва бъдещия екран "Днес" (кой урок следва по ред).
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY_COMPLETED_LESSONS = "completed_lessons";

export async function getCompletedLessons() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_COMPLETED_LESSONS);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("progress.getCompletedLessons error:", e);
    return [];
  }
}

export async function isLessonCompleted(kvKey) {
  if (!kvKey) return false;
  const completed = await getCompletedLessons();
  return completed.includes(kvKey);
}

export async function markLessonCompleted(kvKey) {
  if (!kvKey) return;
  try {
    const completed = await getCompletedLessons();
    if (!completed.includes(kvKey)) {
      completed.push(kvKey);
      await AsyncStorage.setItem(STORAGE_KEY_COMPLETED_LESSONS, JSON.stringify(completed));
    }
  } catch (e) {
    console.error("progress.markLessonCompleted error:", e);
  }
}
