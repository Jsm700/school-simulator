// src/services/ai.js
const API_URL = "https://frosty-dawn-e989.yassen-mladenov.workers.dev";

export async function getTeacherResponse(messages, lessonContent, studentName, studentGender, studentGrade) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: messages,
      lessonContent: lessonContent,
      studentName: studentName || "ученико",
      studentGender: studentGender || "male",
      studentGrade: studentGrade || "3",
    }),
  });
  const data = await response.json();

  if (data.error) {
    throw new Error(data.error);
  }

  return typeof data === "string" ? data : (data.content?.[0]?.text || "");
}
