// src/services/progress.js
// Централизирано проследяване кои уроци детето е завършило. От 2026-09-23
// чете/пише от backend-а (per child_id), не от AsyncStorage — вижда се от
// всяко устройство, свързано към същото дете.
import { BACKEND_URL, getCurrentChildId } from "./deviceLink";

export async function getCompletedLessons() {
  const childId = await getCurrentChildId();
  if (!childId) return [];
  try {
    const res = await fetch(`${BACKEND_URL}/children/${childId}/progress`);
    const data = await res.json();
    return data.completed_kv_keys || [];
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
  const childId = await getCurrentChildId();
  if (!childId) return;
  try {
    await fetch(`${BACKEND_URL}/children/${childId}/progress/${kvKey}`, { method: "POST" });
  } catch (e) {
    console.error("progress.markLessonCompleted error:", e);
  }
}
