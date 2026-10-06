// src/services/deviceLink.js
// Управлява връзката на това устройство със "семейство" на новия backend —
// родителско устройство създава семеен код + детски профили; детско устройство
// въвежда кода веднъж и избира кой профил е то. Резултатът се пази локално
// (AsyncStorage), за да не се пита повторно при всяко отваряне.

import AsyncStorage from "@react-native-async-storage/async-storage";

export const BACKEND_URL = "https://school-simulator-backend.onrender.com";

const STORAGE_KEY_LINK = "device_link"; // { role: "parent"|"child", familyId, familyCode, childId? }
const STORAGE_KEY_PARENT_BACKUP = "parent_link_backup"; // родителски link, запазен докато родителят "влиза като" дете

export async function getLinkedDevice() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_LINK);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error("deviceLink.getLinkedDevice error:", e);
    return null;
  }
}

export async function saveLinkedDevice(link) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_LINK, JSON.stringify(link));
  } catch (e) {
    console.error("deviceLink.saveLinkedDevice error:", e);
  }
}

export async function getCurrentChildId() {
  const link = await getLinkedDevice();
  return link && link.role === "child" ? link.childId : null;
}

export async function unlinkDevice() {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY_LINK);
  } catch (e) {
    console.error("deviceLink.unlinkDevice error:", e);
  }
}

// Логва реално прекарано време за дневната "батерия" (Focus-line функция)
export async function logActivityMinutes(minutes) {
  if (!minutes || minutes <= 0) return;
  const childId = await getCurrentChildId();
  if (!childId) return;
  try {
    await fetch(`${BACKEND_URL}/children/${childId}/activity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minutes }),
    });
  } catch (e) {
    console.error("deviceLink.logActivityMinutes error:", e);
  }
}

async function post(path, body) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`POST ${path} -> ${res.status}: ${text}`);
  }
  return res.json();
}

async function get(path) {
  const res = await fetch(`${BACKEND_URL}${path}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GET ${path} -> ${res.status}: ${text}`);
  }
  return res.json();
}

export async function createFamily() {
  return post("/families"); // { family_id, code }
}

export async function joinFamily(code) {
  return post("/families/join", { code: (code || "").trim().toUpperCase() }); // { family_id, code, children }
}

export async function addChild(familyId, { name, gender, grade }) {
  return post(`/families/${familyId}/children`, { name, gender, grade });
}

export async function listChildren(familyId) {
  return get(`/families/${familyId}/children`);
}

export async function updateChild(familyId, childId, updates) {
  const res = await fetch(`${BACKEND_URL}/families/${familyId}/children/${childId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates || {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PATCH child -> ${res.status}: ${text}`);
  }
  return res.json();
}

// Синхронизира локално кешираните име/пол на детето с истината от сървъра и ги
// записва в AsyncStorage ключовете, които ползват Днес/Quiz/Revive екраните
// ("student_name"/"student_gender"). Без това, за свързано дете тези ключове
// остават празни и Днес екранът пада на "Тони"/"male".
export async function syncLinkedChildProfile() {
  const link = await getLinkedDevice();
  if (!link || link.role !== "child") return null;
  let name = link.childName;
  let gender = link.childGender;
  let grade = link.childGrade;
  if (link.familyId && link.childId) {
    try {
      const list = await listChildren(link.familyId);
      const fresh = list.find((c) => c.id === link.childId);
      if (fresh) {
        name = fresh.name;
        gender = fresh.gender;
        grade = fresh.grade;
        if (fresh.name !== link.childName || fresh.gender !== link.childGender || fresh.grade !== link.childGrade) {
          await saveLinkedDevice({ ...link, childName: name, childGender: gender, childGrade: grade });
        }
      }
    } catch (e) {
      // няма мрежа — ползваме кешираното от link-а
    }
  }
  try {
    if (name) await AsyncStorage.setItem("student_name", name);
    if (gender) await AsyncStorage.setItem("student_gender", gender);
  } catch (e) {}
  return { name, gender, grade };
}

// Родителското устройство "влиза" временно в детски изглед за дадено дете —
// пази оригиналния родителски link настрана, за да може да се върне обратно
// без деинсталиране/повторно въвеждане на семейния код.
export async function enterChildView(parentLink, child) {
  await AsyncStorage.setItem(STORAGE_KEY_PARENT_BACKUP, JSON.stringify(parentLink));
  await saveLinkedDevice({
    role: "child",
    familyId: parentLink.familyId,
    familyCode: parentLink.familyCode,
    childId: child.id,
    childName: child.name,
    childGender: child.gender,
    childGrade: child.grade,
  });
}

export async function isInChildViewFromParent() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_PARENT_BACKUP);
    return !!raw;
  } catch (e) {
    return false;
  }
}

export async function exitChildView() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_PARENT_BACKUP);
    if (!raw) return null;
    const parentLink = JSON.parse(raw);
    await saveLinkedDevice(parentLink);
    await AsyncStorage.removeItem(STORAGE_KEY_PARENT_BACKUP);
    return parentLink;
  } catch (e) {
    console.error("deviceLink.exitChildView error:", e);
    return null;
  }
}
