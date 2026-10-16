// src/services/rewards.js
// Нива, портфейл, жетони, награди и глоби (решено 16.10.2026).
// Всичко се смята на сървъра (backend/server.py) — тук са само извикванията.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BACKEND_URL, getCurrentChildId } from "./deviceLink";

async function call(path, options) {
  const res = await fetch(`${BACKEND_URL}${path}`, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "Грешка при връзката");
  return data;
}

const post = (path, body) =>
  call(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });

export async function getWallet(childId) {
  const id = childId || (await getCurrentChildId());
  if (!id) return null;
  try {
    return await call(`/children/${id}/wallet`);
  } catch (e) {
    return null;
  }
}

export async function exchangeTokens(count = 1) {
  const id = await getCurrentChildId();
  return post(`/children/${id}/tokens/exchange`, { count });
}

export async function getRewards(childId) {
  const id = childId || (await getCurrentChildId());
  return call(`/children/${id}/rewards`);
}

export async function requestReward(rewardId) {
  const id = await getCurrentChildId();
  return post(`/children/${id}/rewards/request`, { reward_id: rewardId });
}

// action: "deliver" | "cancel" — вика се от родителския изглед
export async function resolveRewardRequest(childId, requestId, action) {
  return post(`/children/${childId}/rewards/requests/${requestId}/${action}`);
}

export async function forgivePenalty(childId, penaltyId) {
  return post(`/children/${childId}/penalties/${penaltyId}/forgive`);
}

export async function getFamilyRewards(familyId) {
  return call(`/families/${familyId}/rewards`);
}

export async function saveFamilyRewards(familyId, rewards) {
  return call(`/families/${familyId}/rewards`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rewards }),
  });
}

// Голяма цел (касичка)
export async function chooseGoal(goalId) {
  const id = await getCurrentChildId();
  return post(`/children/${id}/goal/choose`, { goal_id: goalId });
}

export async function depositGoal(count = 1) {
  const id = await getCurrentChildId();
  return post(`/children/${id}/goal/deposit`, { count });
}

export async function claimGoal() {
  const id = await getCurrentChildId();
  return post(`/children/${id}/goal/claim`);
}

// родителят сменя целта на детето (спестеното остава)
export async function changeGoal(childId, goalId) {
  return post(`/children/${childId}/goal/change`, { goal_id: goalId });
}

export async function saveFamilyGoals(familyId, goals) {
  return call(`/families/${familyId}/goals`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ goals }),
  });
}

// Какво детето вече е видяло (ниво, глоби) — за да покажем съобщение само веднъж.
const SEEN_KEY = "rewards_seen_v1";

export async function getNewEvents(wallet) {
  if (!wallet) return { levelUp: null, penalties: [], goalMilestone: null };
  let seen = {};
  try {
    seen = JSON.parse((await AsyncStorage.getItem(SEEN_KEY)) || "{}");
  } catch (e) {
    seen = {};
  }
  const first = seen.level == null;
  const levelUp = !first && wallet.level.level > seen.level ? wallet.level : null;
  const seenPen = new Set(seen.penalties || []);
  const penalties = first ? [] : (wallet.penalties || []).filter((p) => !p.forgiven && !seenPen.has(p.id));
  // Празнуване на 25/50/75 % от касичката (пълната касичка има собствено съобщение при пускането)
  const g = wallet.goal;
  const quarter = g && g.cost > 0 ? Math.floor((g.saved / g.cost) * 4) : 0;
  const goalKey = g ? g.id : null;
  const goalMilestone = !first && g && goalKey === seen.goalId && quarter > (seen.goalQuarter || 0) && quarter >= 1 && quarter <= 3
    ? { title: g.title, percent: quarter * 25, saved: g.saved, cost: g.cost }
    : null;
  const next = {
    level: wallet.level.level,
    penalties: (wallet.penalties || []).map((p) => p.id),
    goalId: goalKey,
    goalQuarter: quarter,
  };
  try {
    await AsyncStorage.setItem(SEEN_KEY, JSON.stringify(next));
  } catch (e) {}
  return { levelUp, penalties, goalMilestone };
}
