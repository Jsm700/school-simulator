// src/services/dailyTasks.js
// "Днес" показва ФИКСИРАНА снимка на задачите за текущия календарен ден. От
// 2026-09-23 снимката се пази в backend-а (per child_id), не локално — датата
// е ключ на самия backend endpoint, така че нов календарен ден автоматично
// не намира вчерашната снимка, без клиентска логика за това.
import { BACKEND_URL, getCurrentChildId } from "./deviceLink";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export async function getTodaySnapshot() {
  const childId = await getCurrentChildId();
  if (!childId) return null;
  try {
    const res = await fetch(`${BACKEND_URL}/children/${childId}/daily-tasks?date=${todayStr()}`);
    const data = await res.json();
    return data; // {child_id, date, assignments} — assignments може да е {} ако още няма снимка
  } catch (e) {
    console.error("dailyTasks.getTodaySnapshot error:", e);
    return null;
  }
}

export async function saveTodaySnapshot(assignments) {
  const snapshot = { date: todayStr(), assignments };
  const childId = await getCurrentChildId();
  if (childId) {
    try {
      await fetch(`${BACKEND_URL}/children/${childId}/daily-tasks`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      });
    } catch (e) {
      console.error("dailyTasks.saveTodaySnapshot error:", e);
    }
  }
  return snapshot;
}
