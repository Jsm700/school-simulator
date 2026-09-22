// src/services/schedule.js
// Седмичен ПОВТАРЯЩ СЕ шаблон — кой предмет кой ден от седмицата има детето в
// реалното училище. "Днес" екранът гледа НАПРЕД (предстоящи 1-2 дни), не назад,
// затова липсва нужда от "нямахме час" бутон — виж lesson-livening-brainstorm.
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY_SCHEDULE = "weekly_schedule"; // { subjectValue: [1,3,5], ... } 1=Пон ... 7=Нед

export const WEEKDAY_LABELS = [
  { value: 1, label: "Пон" },
  { value: 2, label: "Вт" },
  { value: 3, label: "Ср" },
  { value: 4, label: "Чет" },
  { value: 5, label: "Пет" },
];

export async function getSchedule() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_SCHEDULE);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error("schedule.getSchedule error:", e);
    return {};
  }
}

export async function setSchedule(schedule) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_SCHEDULE, JSON.stringify(schedule));
  } catch (e) {
    console.error("schedule.setSchedule error:", e);
  }
}

// ISO ден (1=Пон...7=Нед) за дадена дата
function isoWeekday(date) {
  const day = date.getDay(); // 0=Нед...6=Съб
  return day === 0 ? 7 : day;
}

// За всеки предмет в графика смята колко дни остават до следващия му час
// (0 = днес, 1 = утре, ...). Връща само предметите, чийто час е в прозореца.
export function getUpcomingSubjects(schedule, daysAhead = 1, fromDate = new Date()) {
  const todayIso = isoWeekday(fromDate);
  const upcoming = [];

  for (const [subject, days] of Object.entries(schedule)) {
    if (!Array.isArray(days) || days.length === 0) continue;
    let minDelta = 8;
    for (const d of days) {
      let delta = d - todayIso;
      if (delta < 0) delta += 7;
      if (delta < minDelta) minDelta = delta;
    }
    if (minDelta <= daysAhead) {
      upcoming.push({ subject, daysUntil: minDelta });
    }
  }
  upcoming.sort((a, b) => a.daysUntil - b.daysUntil);
  return upcoming;
}
