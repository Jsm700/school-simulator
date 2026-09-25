// src/services/dailyTasks.js
// Фиксирана снимка на задачите за ЕДИН КОНКРЕТЕН календарен ден. Първоначално
// беше само "днес", но "Днес" екранът вече позволява избор на дата напред
// (2026-09-25) — детето/родителят решават коя дата да подготвят, не винаги
// точно утре. Снимката се пази в backend-а (per child_id), ключувана по дата.
import { BACKEND_URL, getCurrentChildId } from "./deviceLink";

export function dateToStr(date) {
  return date.toISOString().slice(0, 10);
}

export async function getSnapshotForDate(date) {
  const childId = await getCurrentChildId();
  if (!childId) return null;
  try {
    const res = await fetch(`${BACKEND_URL}/children/${childId}/daily-tasks?date=${dateToStr(date)}`);
    const data = await res.json();
    return data; // {child_id, date, assignments} — assignments може да е {} ако още няма снимка
  } catch (e) {
    console.error("dailyTasks.getSnapshotForDate error:", e);
    return null;
  }
}

export async function saveSnapshotForDate(date, assignments) {
  const snapshot = { date: dateToStr(date), assignments };
  const childId = await getCurrentChildId();
  if (childId) {
    try {
      await fetch(`${BACKEND_URL}/children/${childId}/daily-tasks`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      });
    } catch (e) {
      console.error("dailyTasks.saveSnapshotForDate error:", e);
    }
  }
  return snapshot;
}
