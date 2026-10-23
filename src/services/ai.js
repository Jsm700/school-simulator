// src/services/ai.js
const API_URL = "https://frosty-dawn-e989.yassen-mladenov.workers.dev";

// topics: [{key,label}] на урока; mastered: ключовете на вече овладените теми.
// Елена връща evaluation {verdict: correct|partial|wrong|none, topic} за последния отговор.
export async function getTeacherResponse(messages, lessonContent, studentName, studentGender, studentGrade, lessonKey, topics = [], mastered = []) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "chat",
      messages,
      lessonContent,
      lessonKey: lessonKey || "",
      studentName: studentName || "ученико",
      studentGender: studentGender || "male",
      studentGrade: studentGrade || "3",
      topics,
      mastered,
    }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return {
    text: data.text || "",
    audio: data.audio || null,
    audioChunks: data.audioChunks || [],
    expectedAnswerLang: data.expectedAnswerLang || null,
    evaluation: data.evaluation || null,
  };
}

export function lessonTopicsFor(lesson) {
  return (lesson.topics || []).map((key) => ({ key, label: (lesson.topicLabels || {})[key] || key }));
}

export async function getAudio(text) {
  const response = await fetch("https://frosty-dawn-e989.yassen-mladenov.workers.dev", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "tts", text }),
  });
  const data = await response.json();
  return data.audio || null;
}

// ВРЕМЕННА диагностична версия — не гълта грешки, връща HTTP статус и суров body за debug.
export async function getAudioDebug(text) {
  try {
    const response = await fetch("https://frosty-dawn-e989.yassen-mladenov.workers.dev", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "tts", text }),
    });
    const raw = await response.text();
    let data = {};
    try { data = JSON.parse(raw); } catch (e) {}
    return {
      audio: data.audio || null,
      status: response.status,
      error: data.error || null,
      rawSnippet: raw.slice(0, 250),
    };
  } catch (e) {
    return { audio: null, status: null, error: e.message || String(e), rawSnippet: "" };
  }
}
