// src/services/sceneProgress.js
// Пази позицията на детето вътре в "Оживи урока" (LessonReviveScreen) между сесии —
// коя сцена гледа и какви избори вече е направило за всеки урок (по kvKey).
// Използва се, за да "Днес" може да покаже точна позиция ("сцена 3/6"), а самият
// LessonReviveScreen — за да продължи оттам, откъдето детето е излязло последно.
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "scene_progress"; // { [kvKey]: { sceneIndex, total, choices, updatedAt } }

async function readAll() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error("sceneProgress.readAll error:", e);
    return {};
  }
}

export async function getSceneProgress(kvKey) {
  if (!kvKey) return null;
  const all = await readAll();
  return all[kvKey] || null;
}

export async function saveSceneProgress(kvKey, { sceneIndex, total, choices }) {
  if (!kvKey) return;
  try {
    const all = await readAll();
    all[kvKey] = { sceneIndex, total, choices: choices || {}, updatedAt: Date.now() };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch (e) {
    console.error("sceneProgress.saveSceneProgress error:", e);
  }
}

export async function clearSceneProgress(kvKey) {
  if (!kvKey) return;
  try {
    const all = await readAll();
    if (all[kvKey]) {
      delete all[kvKey];
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    }
  } catch (e) {
    console.error("sceneProgress.clearSceneProgress error:", e);
  }
}
