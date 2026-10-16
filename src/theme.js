// src/theme.js
// Облик „Учко“ (16.10.2026): топла хартия + наситено синьо, жълто за точки/награди,
// оранжево за главното действие. Заглавия — Unbounded (fontFamily: "display"),
// текст — Nunito (подава се автоматично от src/ui/Typography.js).
export const colors = {
  primary: "#2563C9",
  primaryDark: "#173F8A",
  primaryLight: "#E7EFFC",
  accent: "#E8743B",
  accentDark: "#B9531F",
  accentLight: "#FDEBDD",
  energy: "#F5B700",
  energyLight: "#FFF4CC",
  success: "#1E8A5A",
  successLight: "#E3F4EA",
  warning: "#F5A623",
  warningLight: "#FFF3CD",
  danger: "#C8372D",
  dangerLight: "#FDECEA",
  background: "#F6F2EA",
  card: "#FFFFFF",
  border: "#E6DFD1",
  text: "#17233B",
  muted: "#6B7385",
  ink: "#17233B",
  bubbleAI: "#FFFFFF",
  bubbleUser: "#2563C9",
  bubbleAIText: "#17233B",
  bubbleUserText: "#FFFFFF",
  pillDone: "#C9EBD6",
  pillDoneText: "#145E3D",
  pillTodo: "#EEE9DF",
  pillTodoText: "#6B7385",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
};

export const font = {
  display: "display",
  regular: "System",
  sizes: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 20,
  },
};

// Цвят, иконка и кратко име по предмет — за чиповете и номерата на уроците
export const SUBJECT_STYLE = {
  human_nature: { emoji: "🌱", short: "Природа", color: "#1E8A5A", light: "#E3F4EA" },
  human_society: { emoji: "🏛️", short: "Общество", color: "#9A5B13", light: "#F8EEDD" },
  history: { emoji: "🏺", short: "История", color: "#A2452B", light: "#F9E6DF" },
  geography: { emoji: "🌍", short: "География", color: "#0E7C86", light: "#DFF3F4" },
  biology: { emoji: "🧬", short: "Биология", color: "#4E8A1E", light: "#EAF4DF" },
  physics: { emoji: "⚡", short: "Физика", color: "#2563C9", light: "#E7EFFC" },
  chemistry: { emoji: "⚗️", short: "Химия", color: "#7A3FB8", light: "#F0E7FA" },
  english: { emoji: "🇬🇧", short: "Английски", color: "#C2364E", light: "#FBE5E9" },
  bulgarian: { emoji: "📖", short: "БЕЛ", color: "#B9531F", light: "#FDEBDD" },
};

export function subjectStyle(subject) {
  return SUBJECT_STYLE[subject] || { emoji: "📘", short: "Урок", color: colors.primary, light: colors.primaryLight };
}
