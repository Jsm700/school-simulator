// src/services/points.js
// Точкова система — от 2026-09-23 изчислена и пазена на backend-а (per
// child_id), не в AsyncStorage. Клиентът само подава суровите числа
// (theme/тема покрити) и показва каквото сървърът върне; формулата
// (10т/тема + бонуси + стрийк) живее в backend/server.py, не тук.
import { BACKEND_URL, getCurrentChildId } from "./deviceLink";

export async function getPointsLog() {
  const childId = await getCurrentChildId();
  if (!childId) return [];
  try {
    const res = await fetch(`${BACKEND_URL}/children/${childId}/points`);
    const data = await res.json();
    return data.log || [];
  } catch (e) {
    console.error("points.getPointsLog error:", e);
    return [];
  }
}

export async function getTotalPoints() {
  const childId = await getCurrentChildId();
  if (!childId) return 0;
  try {
    const res = await fetch(`${BACKEND_URL}/children/${childId}/points`);
    const data = await res.json();
    return data.total || 0;
  } catch (e) {
    console.error("points.getTotalPoints error:", e);
    return 0;
  }
}

export async function awardLessonPoints({ lessonKey, subject, lessonTitle, topicsTotal, topicsCovered }) {
  const childId = await getCurrentChildId();
  if (!childId) return { points: 0, currentStreak: 0 };
  try {
    const res = await fetch(`${BACKEND_URL}/children/${childId}/points/award`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lesson_key: lessonKey,
        subject,
        lesson_title: lessonTitle,
        topics_total: topicsTotal,
        topics_covered: topicsCovered,
      }),
    });
    const data = await res.json();
    return { ...data, currentStreak: data.current_streak };
  } catch (e) {
    console.error("points.awardLessonPoints error:", e);
    return { points: 0, currentStreak: 0 };
  }
}

export async function resetPoints() {
  const childId = await getCurrentChildId();
  if (!childId) return;
  try {
    await fetch(`${BACKEND_URL}/children/${childId}/points/reset`, { method: "POST" });
  } catch (e) {
    console.error("points.resetPoints error:", e);
  }
}
