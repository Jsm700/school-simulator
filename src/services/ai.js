// src/services/ai.js
const API_URL = "https://frosty-dawn-e989.yassen-mladenov.workers.dev";

export async function getTeacherResponse(messages, lessonContent, studentName, studentGender, studentGrade, lessonKey) {
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
    }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return { text: data.text || "", audio: data.audio || null };
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
