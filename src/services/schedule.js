// src/services/schedule.js
// Седмичен ПОВТАРЯЩ СЕ шаблон — кой предмет кой ден от седмицата има детето в
// реалното училище. "Днес" екранът гледа НАПРЕД (предстоящи 1-2 дни), не назад,
// затова липсва нужда от "нямахме час" бутон — виж lesson-livening-brainstorm.
import { SUBJECT_OPTIONS } from "../data/lessons";
import { BACKEND_URL, getCurrentChildId } from "./deviceLink";
// Пълният списък училищни предмети — за самия ГРАФИК (чиста справка), не за
// съдържанието на уроците. SUBJECT_OPTIONS (lessons.js) решава кои от тях имат
// реални уроци в приложението; останалите се показват само информативно в "Днес".
const contentSubjectValues = new Set(SUBJECT_OPTIONS.map((s) => s.value));

export const ALL_SCHOOL_SUBJECTS = [
  { value: "bulgarian", label: "Български език и литература" },
  { value: "math", label: "Математика" },
  { value: "human_nature", label: "Човекът и природата" },
  { value: "human_society", label: "Човекът и обществото" },
  { value: "history", label: "История и цивилизации" },
  { value: "geography", label: "География и икономика" },
  { value: "biology", label: "Биология" },
  { value: "english", label: "Английски език" },
  { value: "music", label: "Музика" },
  { value: "art", label: "Изобразително изкуство" },
  { value: "technology", label: "Технологии и предприемачество" },
  { value: "pe", label: "Физическо възпитание и спорт" },
  { value: "computing", label: "Компютърно моделиране" },
].map((s) => ({ ...s, hasContent: contentSubjectValues.has(s.value) }));

export const WEEKDAY_LABELS = [
  { value: 1, label: "Пон" },
  { value: 2, label: "Вт" },
  { value: 3, label: "Ср" },
  { value: 4, label: "Чет" },
  { value: 5, label: "Пет" },
];

export async function getSchedule() {
  const childId = await getCurrentChildId();
  if (!childId) return {};
  try {
    const res = await fetch(`${BACKEND_URL}/children/${childId}/schedule`);
    return await res.json();
  } catch (e) {
    console.error("schedule.getSchedule error:", e);
    return {};
  }
}

export async function setSchedule(schedule) {
  const childId = await getCurrentChildId();
  if (!childId) return;
  try {
    await fetch(`${BACKEND_URL}/children/${childId}/schedule`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schedule }),
    });
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
// (1 = утре, 2 = вдругиден, ...). ДНЕШНИЯТ ден (delta=0) умишлено НЕ се брои —
// часът за днес вече е минал/в момента тече, а екранът е "Предмети за утре",
// не "Предмети за днес". Връща само предметите, чийто следващ час е в прозореца.
export function getUpcomingSubjects(schedule, daysAhead = 1, fromDate = new Date()) {
  const todayIso = isoWeekday(fromDate);
  const upcoming = [];

  for (const [subject, days] of Object.entries(schedule)) {
    if (!Array.isArray(days) || days.length === 0) continue;
    let minDelta = 8;
    for (const d of days) {
      let delta = d - todayIso;
      if (delta <= 0) delta += 7; // 0 или отрицателно -> пренеси в следващата седмица
      if (delta < minDelta) minDelta = delta;
    }
    if (minDelta >= 1 && minDelta <= daysAhead) {
      upcoming.push({ subject, daysUntil: minDelta });
    }
  }
  upcoming.sort((a, b) => a.daysUntil - b.daysUntil);
  return upcoming;
}
