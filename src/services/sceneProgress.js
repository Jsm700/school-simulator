// src/services/sceneProgress.js
// Пази позицията на детето вътре в "Оживи урока" между сесии — коя сцена
// гледа и какви избори вече е направило, за всеки урок (по kvKey). От
// 2026-09-23 се пази в backend-а (per child_id), не локално на устройството —
// затова "Днес" на родителското устройство може да покаже реалната позиция.
import { BACKEND_URL, getCurrentChildId } from "./deviceLink";

export async function getSceneProgress(kvKey) {
  if (!kvKey) return null;
  const childId = await getCurrentChildId();
  if (!childId) return null;
  try {
    const res = await fetch(`${BACKEND_URL}/children/${childId}/scene-progress/${kvKey}`);
    const data = await res.json();
    if (!data || Object.keys(data).length === 0) return null;
    return { sceneIndex: data.scene_index, total: data.total, choices: data.choices || {} };
  } catch (e) {
    console.error("sceneProgress.getSceneProgress error:", e);
    return null;
  }
}

export async function saveSceneProgress(kvKey, { sceneIndex, total, choices }) {
  if (!kvKey) return;
  const childId = await getCurrentChildId();
  if (!childId) return;
  try {
    await fetch(`${BACKEND_URL}/children/${childId}/scene-progress/${kvKey}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scene_index: sceneIndex, total, choices: choices || {} }),
    });
  } catch (e) {
    console.error("sceneProgress.saveSceneProgress error:", e);
  }
}
