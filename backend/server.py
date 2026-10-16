# backend/server.py
# Backend за Училищен Симулатор — семеен код + детски профили, точки, прогрес,
# сцена-прогрес, седмичен график, дневни задачи. Заменя AsyncStorage-базираните
# services/*.js в клиента — същата логика, преместена тук, четена/писана от
# няколко устройства (родителско + детски).

import os
import re
import json
import random
import string
from datetime import datetime, timedelta
from typing import List

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from motor.motor_asyncio import AsyncIOMotorClient

from models import (
    Family, Child, ChildCreate, ChildUpdate, CompletedLesson, PointsLogEntry,
    AwardPointsRequest, StreakData, SceneProgress, SceneProgressUpdate,
    WeeklySchedule, DailyTaskSnapshot, HomeworkEntry, HomeworkImportRequest, HomeworkCheckRequest,
    HomeworkCheckLog, NotebookEntry, NotebookCheckRequest, new_id,
)

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ.get("DB_NAME", "simulator")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="Uchilishten Simulator Backend")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

POINTS_PER_TOPIC_MIN = 8
POINTS_PER_TOPIC_MAX = 15
JACKPOT_CHANCE = 0.08  # ~1 на 12-13 пъти
JACKPOT_MULTIPLIER = 2
COMPLETION_BONUS = 5
STREAK_POINTS_PER_DAY = 2
STREAK_MAX_BONUS = 20
SAME_DAY_SESSION_GAP_MINUTES = 20  # след толкова неактивност, връщане = нова "сесия"
SAME_DAY_RETURN_BONUS = 5


def today_str() -> str:
    return datetime.utcnow().strftime("%Y-%m-%d")


def gen_family_code() -> str:
    # 6 знака, само главни букви+цифри без объркващи символи (0/O, 1/I)
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(random.choice(alphabet) for _ in range(6))


@app.get("/")
async def root():
    return {"status": "ok", "service": "school-simulator-backend"}


# ---------------- Families / Children ----------------

@app.post("/families")
async def create_family():
    code = gen_family_code()
    # избягва рядкото съвпадение на код
    while await db.families.find_one({"code": code}):
        code = gen_family_code()
    family = Family(code=code)
    await db.families.insert_one(family.dict())
    return {"family_id": family.id, "code": family.code}


@app.post("/families/join")
async def join_family(payload: dict):
    code = (payload.get("code") or "").strip().upper()
    family = await db.families.find_one({"code": code}, {"_id": 0})
    if not family:
        raise HTTPException(404, "Няма семейство с този код")
    children = await db.children.find({"family_id": family["id"]}, {"_id": 0}).to_list(50)
    return {"family_id": family["id"], "code": family["code"], "children": children}


@app.post("/families/{family_id}/children")
async def add_child(family_id: str, payload: ChildCreate):
    family = await db.families.find_one({"id": family_id})
    if not family:
        raise HTTPException(404, "Семейството не е намерено")
    child = Child(family_id=family_id, **payload.dict())
    await db.children.insert_one(child.dict())
    return child.dict()


@app.get("/families/{family_id}/children")
async def list_children(family_id: str):
    children = await db.children.find({"family_id": family_id}, {"_id": 0}).to_list(50)
    return children


@app.patch("/families/{family_id}/children/{child_id}")
async def update_child(family_id: str, child_id: str, payload: ChildUpdate):
    child = await db.children.find_one({"id": child_id, "family_id": family_id})
    if not child:
        raise HTTPException(404, "Детето не е намерено")
    updates = {k: v for k, v in payload.dict().items() if v is not None}
    if updates:
        await db.children.update_one({"id": child_id}, {"$set": updates})
    updated = await db.children.find_one({"id": child_id}, {"_id": 0})
    return updated


# ---------------- Progress ----------------

@app.get("/children/{child_id}/progress")
async def get_progress(child_id: str):
    rows = await db.completed_lessons.find({"child_id": child_id}, {"_id": 0}).to_list(1000)
    return {"completed_kv_keys": [r["kv_key"] for r in rows]}


@app.post("/children/{child_id}/progress/{kv_key}")
async def mark_completed(child_id: str, kv_key: str):
    existing = await db.completed_lessons.find_one({"child_id": child_id, "kv_key": kv_key})
    if not existing:
        entry = CompletedLesson(child_id=child_id, kv_key=kv_key)
        await db.completed_lessons.insert_one(entry.dict())
    return {"ok": True}


# ---------------- Points ----------------

async def update_streak(child_id: str):
    """Връща (streak_points, current_streak, same_day_bonus, is_jackpot).
    streak_points — междудневен бонус (само първия път всеки ден).
    same_day_bonus — малък бонус, ако детето се връща за НОВА сесия същия ден
    (пауза ≥ SAME_DAY_SESSION_GAP_MINUTES от последната активност).
    is_jackpot — рядък 2х множител, приложен от викащата функция.
    """
    now = datetime.utcnow()
    today = today_str()
    streak = await db.streaks.find_one({"child_id": child_id})

    last_active_date = streak.get("last_active_date") if streak else None
    last_activity_raw = streak.get("last_activity_at") if streak else None
    last_activity_at = None
    if isinstance(last_activity_raw, str):
        try:
            last_activity_at = datetime.fromisoformat(last_activity_raw)
        except ValueError:
            last_activity_at = None
    elif isinstance(last_activity_raw, datetime):
        last_activity_at = last_activity_raw

    is_jackpot = random.random() < JACKPOT_CHANCE

    if last_active_date == today:
        # вече е бил активен днес — само проверяваме дали е НОВА сесия (връщане)
        same_day_bonus = 0
        if last_activity_at:
            gap_minutes = (now - last_activity_at).total_seconds() / 60
            if gap_minutes >= SAME_DAY_SESSION_GAP_MINUTES:
                same_day_bonus = SAME_DAY_RETURN_BONUS
        new_streak = streak.get("current_streak", 0)
        streak_points = 0
    else:
        yesterday = (now - timedelta(days=1)).strftime("%Y-%m-%d")
        prev_streak = streak.get("current_streak", 0) if streak else 0
        new_streak = prev_streak + 1 if last_active_date == yesterday else 1
        streak_points = min(new_streak * STREAK_POINTS_PER_DAY, STREAK_MAX_BONUS)
        same_day_bonus = 0

    await db.streaks.update_one(
        {"child_id": child_id},
        {"$set": {
            "child_id": child_id, "last_active_date": today, "current_streak": new_streak,
            "last_activity_at": now.isoformat(),
        }},
        upsert=True,
    )
    return streak_points, new_streak, same_day_bonus, is_jackpot


async def _award_points(child_id: str, lesson_key: str, subject: str, lesson_title: str,
                         topics_total: int, topics_covered: int) -> dict:
    safe_total = max(1, topics_total or 1)
    safe_covered = max(0, min(topics_covered, safe_total))
    complete = safe_covered >= safe_total

    # Променлива награда: случайна стойност на тема вместо фиксирана — предвидимата
    # награда губи стимулиращата си сила бързо, особено при СДВХ (виж lesson-livening-brainstorm)
    base_points = sum(random.randint(POINTS_PER_TOPIC_MIN, POINTS_PER_TOPIC_MAX) for _ in range(safe_covered))
    bonus = COMPLETION_BONUS if complete else 0
    streak_points, current_streak, same_day_bonus, is_jackpot = await update_streak(child_id)

    subtotal = base_points + bonus
    if is_jackpot:
        subtotal *= JACKPOT_MULTIPLIER
    total_points = subtotal + streak_points + same_day_bonus

    entry = PointsLogEntry(
        child_id=child_id,
        date=today_str(),
        lesson_key=lesson_key,
        subject=subject,
        lesson_title=lesson_title,
        topics_total=safe_total,
        topics_covered=safe_covered,
        complete=complete,
        points=total_points,
    )
    await db.points_log.insert_one(entry.dict())
    return {
        **entry.dict(), "current_streak": current_streak,
        "same_day_bonus": same_day_bonus, "is_jackpot": is_jackpot,
    }


async def _award_fixed_points(child_id: str, lesson_key: str, subject: str, lesson_title: str,
                               points: int) -> dict:
    """За източници с фиксирана базова стойност (тетрадка, домашни) — самата база не
    варира (вече обмислена отделно, напр. 20/термин), но jackpot/same-day бонусите
    важат еднакво за всички източници на точки."""
    streak_points, current_streak, same_day_bonus, is_jackpot = await update_streak(child_id)

    subtotal = points * JACKPOT_MULTIPLIER if is_jackpot else points
    total_points = subtotal + streak_points + same_day_bonus

    entry = PointsLogEntry(
        child_id=child_id,
        date=today_str(),
        lesson_key=lesson_key,
        subject=subject,
        lesson_title=lesson_title,
        topics_total=1,
        topics_covered=1,
        complete=True,
        points=total_points,
    )
    await db.points_log.insert_one(entry.dict())
    return {
        **entry.dict(), "current_streak": current_streak,
        "same_day_bonus": same_day_bonus, "is_jackpot": is_jackpot,
    }


@app.get("/children/{child_id}/points")
async def get_points(child_id: str):
    await _apply_overdue_penalties(child_id)
    log = await db.points_log.find({"child_id": child_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    wallet, xp = await _wallet_and_xp(child_id)
    return {"total": wallet, "wallet": wallet, "xp": xp, "level": _level_info(xp), "log": log}


@app.post("/children/{child_id}/points/award")
async def award_points(child_id: str, payload: AwardPointsRequest):
    return await _award_points(
        child_id, payload.lesson_key, payload.subject, payload.lesson_title,
        payload.topics_total, payload.topics_covered,
    )


@app.post("/children/{child_id}/points/reset")
async def reset_points(child_id: str):
    await db.points_log.delete_many({"child_id": child_id})
    await db.streaks.delete_many({"child_id": child_id})
    await db.token_log.delete_many({"child_id": child_id})
    await db.reward_requests.delete_many({"child_id": child_id})
    await db.penalties.delete_many({"child_id": child_id})
    await db.child_goals.delete_many({"child_id": child_id})
    return {"ok": True}


# ---------------- Нива, портфейл, жетони, награди, глоби (решено 16.10.2026) ----------------
# Опит (xp) = всички спечелени точки; никога не намалява → нивото никога не пада.
# Портфейл = сборът на целия дневник; обменът за жетони и глобите са отрицателни записи в него.
# Детето само обменя точки за жетони; наградите от магазина ги потвърждава родителят.

TOKEN_PRICE = 500
HOMEWORK_PENALTY = 20
PENALTY_WEEKLY_CAP = 60
PENALTY_START_DATE = "2026-10-17"  # глоби само за домашни със срок от тази дата нататък
LEVELS = [
    (0, "Новак"), (300, "Ученик"), (700, "Знаещ"), (1200, "Отличник"), (1800, "Експерт"),
    (2500, "Майстор"), (3300, "Мъдрец"), (4200, "Професор"), (5200, "Гений"), (6300, "Легенда"),
]
DEFAULT_REWARDS = [
    {"id": "pocket5", "title": "5 € джобни", "cost": 1},
    {"id": "dinner", "title": "Избираш какво ще вечеряме", "cost": 1},
    {"id": "cinema", "title": "Кино или излизане", "cost": 4},
    {"id": "gift30", "title": "Подарък по избор до 30 €", "cost": 8},
]
_NON_XP_PREFIXES = ("exchange_", "penalty_", "forgive_")


def _sofia_now() -> datetime:
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("Europe/Sofia")).replace(tzinfo=None)
    except Exception:
        return datetime.utcnow() + timedelta(hours=3)


def _to_sofia(dt) -> datetime:
    """created_at/checked_at се пазят в UTC без зона."""
    if isinstance(dt, str):
        try:
            dt = datetime.fromisoformat(dt.replace("Z", ""))
        except ValueError:
            return None
    if not isinstance(dt, datetime):
        return None
    try:
        from zoneinfo import ZoneInfo
        return dt.replace(tzinfo=__import__("datetime").timezone.utc).astimezone(ZoneInfo("Europe/Sofia")).replace(tzinfo=None)
    except Exception:
        return dt + timedelta(hours=3)


def _level_info(xp: int) -> dict:
    idx = 0
    for i, (threshold, _) in enumerate(LEVELS):
        if xp >= threshold:
            idx = i
    start, name = LEVELS[idx]
    nxt = LEVELS[idx + 1][0] if idx + 1 < len(LEVELS) else None
    return {
        "level": idx + 1, "name": name, "from": start, "to": nxt,
        "next_name": LEVELS[idx + 1][1] if nxt is not None else None,
        "progress": 1.0 if nxt is None else round((xp - start) / (nxt - start), 3),
        "remaining": 0 if nxt is None else nxt - xp,
    }


async def _wallet_and_xp(child_id: str):
    log = await db.points_log.find({"child_id": child_id}, {"_id": 0, "points": 1, "lesson_key": 1}).to_list(20000)
    wallet = sum(int(e.get("points") or 0) for e in log)
    xp = sum(int(e.get("points") or 0) for e in log
             if int(e.get("points") or 0) > 0 and not (e.get("lesson_key") or "").startswith(_NON_XP_PREFIXES))
    return max(0, wallet), xp


async def _tokens(child_id: str) -> int:
    rows = await db.token_log.find({"child_id": child_id}, {"_id": 0, "delta": 1}).to_list(20000)
    return max(0, sum(int(r.get("delta") or 0) for r in rows))


def _ledger_entry(child_id: str, key: str, title: str, points: int) -> dict:
    return PointsLogEntry(
        child_id=child_id, date=today_str(), lesson_key=key, subject="", lesson_title=title,
        topics_total=1, topics_covered=1, complete=True, points=points,
    ).dict()


async def _homework_attempted_by(child_id: str, homework_id: str, deadline: datetime) -> bool:
    checks = await db.homework_checks.find(
        {"child_id": child_id, "homework_id": homework_id}, {"_id": 0, "checked_at": 1}).to_list(100)
    for c in checks:
        t = _to_sofia(c.get("checked_at"))
        if t and t < deadline:
            return True
    return False


async def _penalty_candidates(child_id: str):
    """Домашни, които (а) са внесени поне ден преди срока, (б) срокът е от PENALTY_START_DATE нататък,
    (в) не са приети и (г) няма нито един опит за проверка до края на деня на срока."""
    out = []
    rows = await db.homework.find(
        {"child_id": child_id, "archived": {"$ne": True}, "done": {"$ne": True}}, {"_id": 0}).to_list(2000)
    for h in rows:
        due = _try_parse_bg_date(h.get("due_date", ""))
        if not due or due.strftime("%Y-%m-%d") < PENALTY_START_DATE:
            continue
        created = _to_sofia(h.get("created_at"))
        if not created or created.date() >= due.date():
            continue  # внесено в деня на срока или след него — детето не е могло да знае
        out.append((h, due))
    return out


async def _apply_overdue_penalties(child_id: str):
    now = _sofia_now()
    week_start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    for h, due in await _penalty_candidates(child_id):
        deadline = due + timedelta(days=1)  # краят на деня на срока
        if now < deadline:
            continue
        if await db.penalties.find_one({"child_id": child_id, "homework_id": h["id"]}):
            continue
        if await _homework_attempted_by(child_id, h["id"], deadline):
            continue
        this_week = await db.penalties.find(
            {"child_id": child_id, "forgiven": {"$ne": True}}, {"_id": 0, "amount": 1, "created_at": 1}).to_list(500)
        used = sum(int(p.get("amount") or 0) for p in this_week
                   if (_to_sofia(p.get("created_at")) or now) >= week_start)
        wallet, _ = await _wallet_and_xp(child_id)
        amount = max(0, min(HOMEWORK_PENALTY, PENALTY_WEEKLY_CAP - used, wallet))
        pid = new_id()
        if amount > 0:
            await db.points_log.insert_one(_ledger_entry(
                child_id, f"penalty_{pid}", f"Глоба: просрочено домашно ({h.get('subject') or 'без предмет'}, срок {h.get('due_date')})", -amount))
        await db.penalties.insert_one({
            "id": pid, "child_id": child_id, "homework_id": h["id"], "subject": h.get("subject", ""),
            "task_text": h.get("task_text", ""), "due_date": h.get("due_date", ""), "amount": amount,
            "forgiven": False, "created_at": datetime.utcnow(),
        })


async def _at_risk(child_id: str):
    now = _sofia_now()
    out = []
    for h, due in await _penalty_candidates(child_id):
        deadline = due + timedelta(days=1)
        if now >= deadline or (deadline - now).days > 1:
            continue  # вече минало или срокът е след повече от ден
        if await _homework_attempted_by(child_id, h["id"], deadline):
            continue
        days_left = (due.date() - now.date()).days
        out.append({
            "homework_id": h["id"], "subject": h.get("subject", ""), "task_text": h.get("task_text", ""),
            "due_date": h.get("due_date", ""), "amount": HOMEWORK_PENALTY,
            "when": "днес" if days_left <= 0 else "утре",
        })
    return out


async def _family_id(child_id: str) -> str:
    child = await db.children.find_one({"id": child_id}, {"_id": 0, "family_id": 1}) or {}
    return child.get("family_id", "")


async def _family_rewards(family_id: str) -> list:
    row = await db.family_rewards.find_one({"family_id": family_id}, {"_id": 0})
    return (row or {}).get("rewards") or DEFAULT_REWARDS


async def _family_goals(family_id: str) -> list:
    row = await db.family_rewards.find_one({"family_id": family_id}, {"_id": 0, "goals": 1})
    return (row or {}).get("goals") or []


async def _child_goal(child_id: str):
    """Текущата голяма цел на детето (активна или чакаща родителя), иначе None."""
    return await db.child_goals.find_one(
        {"child_id": child_id, "status": {"$in": ["active", "claimed"]}}, {"_id": 0})


async def _claim_goal(child_id: str, goal: dict) -> dict:
    """Касичката е пълна → заявка към родителя. Жетоните вече са в касичката, затова заявката не взема нови."""
    rid = new_id()
    req = {"id": rid, "child_id": child_id, "family_id": await _family_id(child_id), "reward_id": goal["goal_id"],
           "title": f"🎯 {goal['title']}", "cost": goal["cost"], "status": "pending", "kind": "goal",
           "goal_row_id": goal["id"], "created_at": datetime.utcnow(), "resolved_at": None}
    await db.reward_requests.insert_one(dict(req))
    await db.child_goals.update_one({"id": goal["id"]}, {"$set": {"status": "claimed", "request_id": rid}})
    return req


@app.get("/children/{child_id}/wallet")
async def get_wallet(child_id: str):
    await _apply_overdue_penalties(child_id)
    wallet, xp = await _wallet_and_xp(child_id)
    penalties = await db.penalties.find(
        {"child_id": child_id, "amount": {"$gt": 0}}, {"_id": 0}).sort("created_at", -1).to_list(20)
    return {
        "wallet": wallet, "xp": xp, "level": _level_info(xp), "tokens": await _tokens(child_id),
        "token_price": TOKEN_PRICE, "can_exchange": wallet // TOKEN_PRICE,
        "at_risk": await _at_risk(child_id), "penalties": penalties,
        "goal": await _child_goal(child_id),
        "goals_available": len(await _family_goals(await _family_id(child_id))),
    }


@app.post("/children/{child_id}/tokens/exchange")
async def exchange_tokens(child_id: str, payload: dict):
    count = int((payload or {}).get("count") or 1)
    if count < 1:
        raise HTTPException(400, "Невалиден брой жетони")
    wallet, _ = await _wallet_and_xp(child_id)
    cost = count * TOKEN_PRICE
    if wallet < cost:
        raise HTTPException(400, f"Нужни са {cost} точки, имаш {wallet}")
    eid = new_id()
    await db.points_log.insert_one(_ledger_entry(
        child_id, f"exchange_{eid}", f"Обмен: {count} {'жетон' if count == 1 else 'жетона'}", -cost))
    await db.token_log.insert_one({"id": eid, "child_id": child_id, "delta": count, "reason": "exchange",
                                   "created_at": datetime.utcnow()})
    return await get_wallet(child_id)


@app.get("/children/{child_id}/rewards")
async def get_rewards(child_id: str):
    fid = await _family_id(child_id)
    reqs = await db.reward_requests.find({"child_id": child_id}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return {"rewards": await _family_rewards(fid), "requests": reqs, "tokens": await _tokens(child_id),
            "goals": await _family_goals(fid), "goal": await _child_goal(child_id)}


@app.put("/families/{family_id}/rewards")
async def set_family_rewards(family_id: str, payload: dict):
    clean = []
    for r in (payload or {}).get("rewards") or []:
        title = str(r.get("title") or "").strip()
        cost = int(r.get("cost") or 0)
        if title and cost > 0:
            clean.append({"id": str(r.get("id") or new_id()), "title": title[:80], "cost": cost})
    await db.family_rewards.update_one(
        {"family_id": family_id}, {"$set": {"family_id": family_id, "rewards": clean}}, upsert=True)
    return {"rewards": clean}


@app.get("/families/{family_id}/rewards")
async def get_family_rewards(family_id: str):
    return {"rewards": await _family_rewards(family_id), "goals": await _family_goals(family_id)}


# ---------------- Голяма цел (касичка) ----------------
# Родителят задава списък цели (общ за семейството). Детето избира една; жетоните, пуснати в
# касичката, са заключени. При пълна касичка става заявка към родителя. Смяна на целта — само родителят,
# спестеното остава.

@app.put("/families/{family_id}/goals")
async def set_family_goals(family_id: str, payload: dict):
    clean = []
    for g in (payload or {}).get("goals") or []:
        title = str(g.get("title") or "").strip()
        cost = int(g.get("cost") or 0)
        if title and cost > 0:
            clean.append({"id": str(g.get("id") or new_id()), "title": title[:60], "cost": cost})
    await db.family_rewards.update_one(
        {"family_id": family_id}, {"$set": {"family_id": family_id, "goals": clean}}, upsert=True)
    return {"goals": clean}


async def _find_family_goal(child_id: str, goal_id: str) -> dict:
    goal = next((g for g in await _family_goals(await _family_id(child_id)) if g["id"] == goal_id), None)
    if not goal:
        raise HTTPException(404, "Няма такава цел")
    return goal


@app.post("/children/{child_id}/goal/choose")
async def choose_goal(child_id: str, payload: dict):
    """Детето избира цел — само ако още няма."""
    if await _child_goal(child_id):
        raise HTTPException(400, "Вече имаш цел. Само родител може да я смени.")
    g = await _find_family_goal(child_id, (payload or {}).get("goal_id"))
    row = {"id": new_id(), "child_id": child_id, "goal_id": g["id"], "title": g["title"], "cost": g["cost"],
           "saved": 0, "status": "active", "created_at": datetime.utcnow()}
    await db.child_goals.insert_one(dict(row))
    return row


@app.post("/children/{child_id}/goal/change")
async def change_goal(child_id: str, payload: dict):
    """Родителят сменя целта; спестените жетони остават в касичката."""
    g = await _find_family_goal(child_id, (payload or {}).get("goal_id"))
    cur = await _child_goal(child_id)
    if cur and cur.get("status") == "claimed":
        raise HTTPException(400, "Целта чака „Дадено“ или „Откажи“ — първо реши заявката.")
    saved = int((cur or {}).get("saved") or 0)
    if cur:
        await db.child_goals.update_one({"id": cur["id"]}, {"$set": {"status": "replaced"}})
    row = {"id": new_id(), "child_id": child_id, "goal_id": g["id"], "title": g["title"], "cost": g["cost"],
           "saved": saved, "status": "active", "created_at": datetime.utcnow()}
    await db.child_goals.insert_one(dict(row))
    if saved >= g["cost"]:
        await _claim_goal(child_id, row)
    return await _child_goal(child_id)


@app.post("/children/{child_id}/goal/deposit")
async def deposit_goal(child_id: str, payload: dict):
    count = int((payload or {}).get("count") or 1)
    goal = await _child_goal(child_id)
    if not goal or goal.get("status") != "active":
        raise HTTPException(400, "Няма активна цел")
    count = min(count, goal["cost"] - goal["saved"])
    if count < 1:
        raise HTTPException(400, "Касичката е пълна")
    if await _tokens(child_id) < count:
        raise HTTPException(400, "Нямаш достатъчно жетони")
    await db.token_log.insert_one({"id": new_id(), "child_id": child_id, "delta": -count,
                                   "reason": f"goal_{goal['id']}", "created_at": datetime.utcnow()})
    await db.child_goals.update_one({"id": goal["id"]}, {"$inc": {"saved": count}})
    goal["saved"] += count
    if goal["saved"] >= goal["cost"]:
        await _claim_goal(child_id, goal)
    return {"goal": await _child_goal(child_id), "tokens": await _tokens(child_id)}


@app.post("/children/{child_id}/goal/claim")
async def claim_goal(child_id: str):
    """Повторна заявка, ако родителят е отказал, а касичката е пълна."""
    goal = await _child_goal(child_id)
    if not goal or goal.get("status") != "active" or goal["saved"] < goal["cost"]:
        raise HTTPException(400, "Касичката още не е пълна")
    return await _claim_goal(child_id, goal)


@app.post("/children/{child_id}/rewards/request")
async def request_reward(child_id: str, payload: dict):
    fid = await _family_id(child_id)
    reward = next((r for r in await _family_rewards(fid) if r["id"] == (payload or {}).get("reward_id")), None)
    if not reward:
        raise HTTPException(404, "Няма такава награда")
    if await _tokens(child_id) < reward["cost"]:
        raise HTTPException(400, "Нямаш достатъчно жетони")
    rid = new_id()
    await db.token_log.insert_one({"id": new_id(), "child_id": child_id, "delta": -reward["cost"],
                                   "reason": f"request_{rid}", "created_at": datetime.utcnow()})
    req = {"id": rid, "child_id": child_id, "family_id": fid, "reward_id": reward["id"],
           "title": reward["title"], "cost": reward["cost"], "status": "pending",
           "created_at": datetime.utcnow(), "resolved_at": None}
    await db.reward_requests.insert_one(dict(req))
    return req


@app.post("/children/{child_id}/rewards/requests/{request_id}/{action}")
async def resolve_reward_request(child_id: str, request_id: str, action: str):
    req = await db.reward_requests.find_one({"id": request_id, "child_id": child_id}, {"_id": 0})
    if not req or req.get("status") != "pending":
        raise HTTPException(404, "Заявката не е намерена или вече е обработена")
    is_goal = req.get("kind") == "goal"
    if action == "deliver":
        status = "delivered"
        if is_goal:
            await db.child_goals.update_one({"id": req.get("goal_row_id")}, {"$set": {"status": "done"}})
    elif action == "cancel":
        status = "cancelled"
        if is_goal:
            # жетоните остават в касичката — целта пак е активна и пълна
            await db.child_goals.update_one({"id": req.get("goal_row_id")}, {"$set": {"status": "active"}})
        else:
            await db.token_log.insert_one({"id": new_id(), "child_id": child_id, "delta": req["cost"],
                                           "reason": f"refund_{request_id}", "created_at": datetime.utcnow()})
    else:
        raise HTTPException(400, "Непознато действие")
    await db.reward_requests.update_one({"id": request_id},
                                        {"$set": {"status": status, "resolved_at": datetime.utcnow()}})
    return {"ok": True, "status": status}


@app.post("/children/{child_id}/penalties/{penalty_id}/forgive")
async def forgive_penalty(child_id: str, penalty_id: str):
    p = await db.penalties.find_one({"id": penalty_id, "child_id": child_id}, {"_id": 0})
    if not p or p.get("forgiven"):
        raise HTTPException(404, "Глобата не е намерена или вече е опростена")
    if int(p.get("amount") or 0) > 0:
        await db.points_log.insert_one(_ledger_entry(
            child_id, f"forgive_{penalty_id}", f"Опростена глоба ({p.get('subject') or 'домашно'}, срок {p.get('due_date')})",
            int(p["amount"])))
    await db.penalties.update_one({"id": penalty_id}, {"$set": {"forgiven": True}})
    return {"ok": True}


# ---------------- Сцена-прогрес ----------------

@app.get("/children/{child_id}/scene-progress/{kv_key}")
async def get_scene_progress(child_id: str, kv_key: str):
    row = await db.scene_progress.find_one({"child_id": child_id, "kv_key": kv_key}, {"_id": 0})
    return row or {}


@app.put("/children/{child_id}/scene-progress/{kv_key}")
async def save_scene_progress(child_id: str, kv_key: str, payload: SceneProgressUpdate):
    doc = SceneProgress(child_id=child_id, kv_key=kv_key, **payload.dict())
    await db.scene_progress.update_one(
        {"child_id": child_id, "kv_key": kv_key}, {"$set": doc.dict()}, upsert=True
    )
    return {"ok": True}


# ---------------- Седмичен график ----------------

@app.get("/children/{child_id}/schedule")
async def get_schedule(child_id: str):
    row = await db.schedules.find_one({"child_id": child_id}, {"_id": 0})
    return row.get("schedule", {}) if row else {}


@app.put("/children/{child_id}/schedule")
async def save_schedule(child_id: str, payload: dict):
    doc = WeeklySchedule(child_id=child_id, schedule=payload.get("schedule", {}))
    await db.schedules.update_one({"child_id": child_id}, {"$set": doc.dict()}, upsert=True)
    return {"ok": True}


# ---------------- Дневна снимка на задачите ----------------

@app.get("/children/{child_id}/daily-tasks")
async def get_daily_tasks(child_id: str, date: str = None):
    date = date or today_str()
    row = await db.daily_tasks.find_one({"child_id": child_id, "date": date}, {"_id": 0})
    return row or {"child_id": child_id, "date": date, "assignments": {}}


@app.put("/children/{child_id}/daily-tasks")
async def save_daily_tasks(child_id: str, payload: dict):
    date = payload.get("date") or today_str()
    doc = DailyTaskSnapshot(child_id=child_id, date=date, assignments=payload.get("assignments", {}))
    await db.daily_tasks.update_one(
        {"child_id": child_id, "date": date}, {"$set": doc.dict()}, upsert=True
    )
    return {"ok": True}


# ---------------- Дневна "батерия" — реално прекарано време ----------------

DAILY_GOAL_MINUTES = 120  # 2 часа — целта, обсъдена в linia "Фокус"


@app.post("/children/{child_id}/activity")
async def log_activity(child_id: str, payload: dict):
    minutes = max(0, float(payload.get("minutes", 0)))
    if minutes <= 0:
        return {"ok": True, "total_minutes": None}
    date = today_str()
    await db.activity_log.update_one(
        {"child_id": child_id, "date": date},
        {"$inc": {"total_minutes": minutes}, "$set": {"child_id": child_id, "date": date}},
        upsert=True,
    )
    row = await db.activity_log.find_one({"child_id": child_id, "date": date}, {"_id": 0})
    return {"ok": True, "total_minutes": row.get("total_minutes", 0) if row else minutes}


@app.get("/children/{child_id}/activity/today")
async def get_activity_today(child_id: str):
    date = today_str()
    row = await db.activity_log.find_one({"child_id": child_id, "date": date}, {"_id": 0})
    total = row.get("total_minutes", 0) if row else 0
    return {"date": date, "total_minutes": total, "goal_minutes": DAILY_GOAL_MINUTES}

# ---------------- Домашни (внос от Школо) ----------------

def _parse_data_url(data_url: str):
    m = re.match(r"^data:(image/\w+);base64,(.+)$", data_url)
    if not m:
        raise HTTPException(400, "Невалиден формат на снимка")
    return m.group(1), m.group(2)


def _make_thumb(data_url: str, max_side: int = 1000, quality: int = 60) -> str:
    """Умалява снимка до JPEG data URL (~80-150 KB) за пазене в базата. При проблем връща "" —
    пазенето на снимка никога не бива да чупи проверката на домашното."""
    try:
        import base64
        import io
        from PIL import Image, ImageOps
        _, b64 = _parse_data_url(data_url)
        img = Image.open(io.BytesIO(base64.b64decode(b64)))
        img = ImageOps.exif_transpose(img).convert("RGB")
        img.thumbnail((max_side, max_side))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality, optimize=True)
        return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
    except Exception:
        return ""


# Цени на Anthropic API в долари за 1 млн. токена (вход, изход) — за приблизителния брояч на
# разхода в родителския изглед. При смяна на модел или цена се обновяват тук.
AI_PRICES_USD = {
    "claude-opus-5-5": (4.0, 20.0),
    "claude-sonnet-5-5": (2.0, 10.0),
    "claude-sonnet-4-6": (3.0, 15.0),
    "claude-haiku-4-5": (1.0, 5.0),
}
USD_TO_EUR = float(os.environ.get("USD_TO_EUR", "0.87"))  # приблизителен курс, само за показване


async def _log_ai_usage(child_id: str, kind: str, data: dict):
    """Записва разхода за една AI заявка (токени и приблизителна цена). Броячът никога не
    бива да чупи самата проверка, затова всяка грешка тук се преглъща."""
    try:
        usage = (data or {}).get("usage") or {}
        model = (data or {}).get("model") or ""
        tokens_in = int(usage.get("input_tokens") or 0)
        tokens_out = int(usage.get("output_tokens") or 0)
        price = next((v for k, v in AI_PRICES_USD.items() if model.startswith(k)), None)
        cost = (tokens_in * price[0] + tokens_out * price[1]) / 1_000_000 if price else 0.0
        await db.ai_usage.insert_one({
            "id": "".join(random.choices(string.ascii_lowercase + string.digits, k=16)),
            "child_id": child_id, "kind": kind, "model": model,
            "input_tokens": tokens_in, "output_tokens": tokens_out,
            "cost_usd": round(cost, 5), "priced": bool(price),
            "month": datetime.utcnow().strftime("%Y-%m"),
            "created_at": datetime.utcnow(),
        })
    except Exception as e:
        print("ai_usage log error:", repr(e))


def _prep_image_for_ai(data_url: str):
    """Подготвя снимка за AI проверката: изправя я по EXIF, свива я до разумен размер и
    изсветлява/вдига контраста (детските снимки често са тъмни). При проблем връща оригинала."""
    try:
        import base64
        import io
        from PIL import Image, ImageOps
        media_type, b64 = _parse_data_url(data_url)
        img = Image.open(io.BytesIO(base64.b64decode(b64)))
        img = ImageOps.exif_transpose(img).convert("RGB")
        img.thumbnail((2000, 2000))
        img = ImageOps.autocontrast(img, cutoff=1)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=90)
        return "image/jpeg", base64.b64encode(buf.getvalue()).decode("ascii")
    except Exception:
        return _parse_data_url(data_url)


# Проверката по математика е на по-силния модел: на тест върху реално домашно (8 окт. 2026)
# само той разчете и оцени вярно всяка подточка. Останалите проверки остават на по-евтиния.
MATH_CHECK_MODEL = "claude-opus-5-5"

MATH_CHECK_PROMPT = """Ти проверяваш домашно по математика на {who}. Заданието от електронния дневник е: "{task_text}".

Приложени са снимки: някои показват печатното условие (страница от учебник или сборник), други — ръкописното решение на детето. Снимките може да са завъртени.

Работи в този ред:

1. КАЧЕСТВО НА СНИМКИТЕ. Прецени дали ръкописът се чете уверено. Ако някоя част е тъмна, размазана, снимана отдалече или под ъгъл, така че не можеш да разчетеш със сигурност цифри, знаци и степенни показатели — кажи го. НИКОГА не отгатвай нечетливо и не приемай, че "сигурно е вярно".

2. КОИ ЗАДАЧИ СЕ ИСКАТ. От заданието и от снимките с условието направи списък на ВСИЧКИ поискани задачи и подточки (напр. "Опитай сам" на дадена страница означава всички номерирани задачи в тази рубрика, с всичките им подточки). Всяка подточка е отделен ред в списъка. Ако няма снимка на условието, работи по това, което детето е преписало, и го отбележи в качеството на снимките.

3. ЗА ВСЯКА ПОДТОЧКА ПООТДЕЛНО, без изключения:
   а) препиши условието от печатната страница;
   б) РЕШИ Я САМ, независимо от написаното от детето, и запиши крайния верен отговор;
   в) препиши точно какво е написало детето като краен отговор (ако не се чете — пиши "не се чете");
   г) сравни и определи статус:
      - "correct": крайният отговор на детето съвпада с твоя (еквивалентен запис е допустим) И отговаря на точно това, което се пита;
      - "wrong": има грешка в пресмятането или крайният отговор е различен от верния;
      - "incomplete": пресмятанията дотук са верни, но не е стигнато до отговор на зададения въпрос (напр. пита се "в колко часа", а е намерено само време в часове; пита се за три страни, а са намерени две; изразът не е опростен докрай);
      - "missing": подточката изобщо не се вижда в решението;
      - "unreadable": не можеш да разчетеш отговора със сигурност.
   Бъди взискателен: едночлен, записан с излишни или грешни множители/степени, е "wrong". Не давай "correct" по съмнение.

4. Не преценявай общо "прието/неприето" — това го решава програмата по статусите.
{previous}
Полето note е едно кратко изречение към детето на разбираем език: какво е сбъркано или какво липсва, БЕЗ да казваш верния отговор; празно при correct. {address} Предай резултата с инструмента report_check."""

MATH_CHECK_TOOL = {
    "name": "report_check",
    "description": "Предава резултата от проверката на домашното, подточка по подточка.",
    "input_schema": {
        "type": "object",
        "properties": {
            "photo_quality": {
                "type": "object",
                "properties": {
                    "readable": {"type": "boolean"},
                    "problem": {"type": "string"},
                },
                "required": ["readable", "problem"],
            },
            "tasks": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string", "description": "напр. Уч.32/1г"},
                        "condition": {"type": "string"},
                        "correct_answer": {"type": "string"},
                        "student_answer": {"type": "string"},
                        "status": {"type": "string", "enum": ["correct", "wrong", "incomplete", "missing", "unreadable"]},
                        "note": {"type": "string"},
                    },
                    "required": ["id", "condition", "correct_answer", "student_answer", "status", "note"],
                },
            },
        },
        "required": ["photo_quality", "tasks"],
    },
}

PHOTO_RETAKE_TIP = (
    "Снимай пак: на светло, отблизо и право отгоре, по една страница на снимка, "
    "без сянка от ръката и така, че целият лист да е в кадъра."
)


def _decide_math_check(verdict: dict):
    """Решението прието/неприето се взима ТУК, не от AI-то: приема се само ако има поне една
    задача и всяка поискана подточка е със статус "correct". Връща (passed, feedback)."""
    tasks = [t for t in (verdict.get("tasks") or []) if isinstance(t, dict)]
    quality = verdict.get("photo_quality") or {}
    by_status = {}
    for t in tasks:
        by_status.setdefault(t.get("status") or "unreadable", []).append(t)
    correct = by_status.get("correct", [])
    passed = bool(tasks) and len(correct) == len(tasks)

    if passed:
        return True, f"Всички {len(tasks)} задачи и подточки са решени вярно. Браво!"

    lines = []
    if not tasks:
        problem = (quality.get("problem") or "").strip()
        return False, ("Не успях да разчета домашното. " + (problem + " " if problem else "") + PHOTO_RETAKE_TIP)
    lines.append(f"Верни: {len(correct)} от {len(tasks)}.")

    def _fmt(t):
        note = (t.get("note") or "").strip()
        return f"{t.get('id', '?')}: {note}" if note else str(t.get("id", "?"))

    for status, title in (("wrong", "❌ Грешни"), ("incomplete", "✏️ Недовършени"), ("missing", "➖ Липсват")):
        items = by_status.get(status, [])
        if items:
            lines.append(title + ":")
            lines.extend("• " + _fmt(t) for t in items)
    unreadable = by_status.get("unreadable", [])
    if unreadable:
        lines.append("📷 Не се четат: " + ", ".join(str(t.get("id", "?")) for t in unreadable) + ".")
        lines.append(PHOTO_RETAKE_TIP)
    return False, "\n".join(lines)


async def _check_math_homework(task_text: str, images: List[str], previous_issues: List[dict],
                               child: dict = None, child_id: str = "") -> dict:
    """Строга проверка по математика: AI-то препрочита и решава всяка подточка поотделно и
    връща структуриран резултат; дали домашното е прието решава _decide_math_check."""
    previous = ""
    if previous_issues:
        listed = "; ".join(
            f"{t.get('id', '?')} ({t.get('status', '')})" for t in previous_issues[:30]
        )
        previous = (
            "\nВАЖНО: това е повторен опит за същото домашно. При предишната проверка не бяха приети: "
            f"{listed}. Провери тези подточки особено внимателно и ги приеми само ако на снимките "
            "ясно се вижда поправено, вярно решение.\n"
        )
    child = child or {}
    grade = str(child.get("grade") or "").strip()
    is_girl = child.get("gender") == "female"
    who = ("ученичка" if is_girl else "ученик") + (f" от {grade}. клас" if grade else "")
    address = (
        "Детето е момиче — обръщай се към него в женски род (\"намерила си\", \"пропуснала си\")."
        if is_girl else
        "Детето е момче — обръщай се към него в мъжки род (\"намерил си\", \"пропуснал си\")."
    )
    content = [{"type": "text", "text": MATH_CHECK_PROMPT.format(
        task_text=task_text, previous=previous, who=who, address=address)}]
    for img in images:
        media_type, b64 = _prep_image_for_ai(img)
        content.append({"type": "image", "source": {"type": "base64", "media_type": media_type, "data": b64}})

    async with httpx.AsyncClient(timeout=240.0) as client:
        res = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            json={
                "model": MATH_CHECK_MODEL,
                "max_tokens": 12000,
                "tools": [MATH_CHECK_TOOL],
                # Този модел не приема принудителен избор на инструмент; промптът изисква
                # извикването, а по-долу има резервно разчитане, ако отговори с текст.
                "tool_choice": {"type": "auto"},
                "messages": [{"role": "user", "content": content}],
            },
        )
    if res.status_code != 200:
        raise HTTPException(502, f"Claude API грешка: {res.status_code} {res.text[:300]}")
    data = res.json()
    await _log_ai_usage(child_id, "homework_math", data)
    if data.get("stop_reason") == "max_tokens":
        raise HTTPException(502, "Проверката излезе твърде дълга — пробвай с по-малко снимки наведнъж")
    for block in data.get("content", []):
        if block.get("type") == "tool_use" and isinstance(block.get("input"), dict):
            return block["input"]
    text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text").strip()
    parsed = _parse_verdict_json(text)
    if not isinstance(parsed, dict) or not isinstance(parsed.get("tasks"), list):
        raise HTTPException(502, "Не успях да разчета отговора на AI-то")
    return parsed


def _parse_verdict_json(raw_text: str) -> dict:
    """Разчита JSON обект {"passed": ..., "feedback": ...} от отговора на Claude,
    издържа на code fences, типографски кавички, и увод/следсловие покрай JSON-а
    (по-вероятно при повече снимки в едно запитване)."""
    text = (raw_text or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(json)?", "", text).strip()
        text = re.sub(r"```$", "", text).strip()
    text = text.translate(str.maketrans({
        "„": "'", "“": "'", "”": "'", "«": "'", "»": "'",
    }))
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                pass
        raise HTTPException(502, "Не успях да разчета отговора на AI-то")


async def _extract_homework_from_images(images: List[str], child_id: str = "") -> List[dict]:
    if not ANTHROPIC_API_KEY:
        raise HTTPException(500, "ANTHROPIC_API_KEY не е зададен на сървъра")

    content = [{
        "type": "text",
        "text": (
            "Виждаш един или няколко скрийншота от таблица с домашни в българска "
            "училищна платформа (Школо). За всеки ред в таблицата/таблиците извлечи: "
            "subject (предмет). Над всяка таблица има заглавие с предмета, например "
            "'Математика (ООП) - Христинка И. Пеева' или 'Математика (ИУЧ - РП/УП-А) - Христинка И. Пеева'. "
            "Копирай това заглавие ДОСЛОВНО и ЦЯЛО (с думите в скоби и с името на учителя) като subject "
            "на ВСЕКИ ред от таблицата под него — не го съкращавай, не го превеждай и не махай нищо. "
            "Разликата в скобите (например ООП и ИУЧ) е важна: това са два различни предмета. "
            "Ако на скрийншота няма заглавие над таблицата, остави subject празен, но НЕ го измисляй. "
            "date_assigned (датата на задаване, както е показана), "
            "task_text (пълния текст на домашното), "
            "due_date (срокът, както е показан). "
            "ВАЖНО за task_text: ако текстът съдържа кавички от какъвто и да е вид "
            "(„...\u201c, ,,...\u201c, \"...\", «...» и т.н.), ПРЕМАХНИ ги напълно от "
            "task_text — не ги възпроизвеждай изобщо, дори като единични кавички. "
            "Никога не слагай символа \" (права кавичка) никъде вътре в стойността на "
            "task_text — той ще счупи JSON формата. "
            "Върни САМО валиден JSON масив от обекти с тези 4 полета, без никакъв друг текст, "
            "без markdown, без обяснения. Ако не намериш нито един ред, върни []."
        ),
    }]
    for data_url in images:
        media_type, b64 = _parse_data_url(data_url)
        content.append({
            "type": "image",
            "source": {"type": "base64", "media_type": media_type, "data": b64},
        })

    async with httpx.AsyncClient(timeout=120.0) as client:
        res = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            json={
                "model": "claude-sonnet-4-6",
                "max_tokens": 8000,
                "messages": [{"role": "user", "content": content}],
            },
        )
    if res.status_code != 200:
        raise HTTPException(502, f"Claude API грешка: {res.status_code} {res.text[:300]}")

    data = res.json()
    await _log_ai_usage(child_id, "import", data)
    stop_reason = data.get("stop_reason", "")
    text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(json)?", "", text).strip()
        text = re.sub(r"```$", "", text).strip()
    # Защита: типографски кавички (българските „...“ / ,,...“ / «...») чупят JSON,
    # ако AI-то ги е преписало буквално въпреки инструкцията — сменяме ги превантивно.
    text = text.translate(str.maketrans({
        "\u201e": "'", "\u201c": "'", "\u201d": "'", "\u00ab": "'", "\u00bb": "'",
    }))
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as e:
        # Резервен опит: извади само частта, изглеждаща като JSON масив,
        # ако Claude е добавил странична дума покрай него
        m = re.search(r"\[.*\]", text, re.DOTALL)
        if m:
            try:
                parsed = json.loads(m.group(0))
            except json.JSONDecodeError:
                parsed = None
        else:
            parsed = None
        if parsed is None:
            print(
                f"[homework-import] JSON parse failed: {e} | stop_reason={stop_reason} | "
                f"text_len={len(text)} | around_error={text[max(0,e.pos-100):e.pos+100]!r}"
            )
            hint = " (отговорът изглежда отрязан — пробвай с по-малко снимки наведнъж)" if stop_reason == "max_tokens" else ""
            raise HTTPException(502, f"Не успях да разчета отговора на AI-то като JSON{hint}")
    return parsed if isinstance(parsed, list) else []


@app.post("/children/{child_id}/homework/import")
async def import_homework(child_id: str, payload: HomeworkImportRequest):
    extracted = await _extract_homework_from_images(payload.images, child_id)

    existing = await db.homework.find({"child_id": child_id}, {"_id": 0}).to_list(1000)
    existing_keys = {(e.get("subject", ""), e.get("task_text", "")) for e in existing}

    added = []
    skipped = 0
    for row in extracted:
        subject = (row.get("subject") or "").strip()
        task_text = (row.get("task_text") or "").strip()
        if not task_text:
            continue
        key = (subject, task_text)
        if key in existing_keys:
            skipped += 1
            continue
        entry = HomeworkEntry(
            child_id=child_id,
            subject=subject,
            date_assigned=(row.get("date_assigned") or "").strip(),
            task_text=task_text,
            due_date=(row.get("due_date") or "").strip(),
        )
        await db.homework.insert_one(entry.dict())
        existing_keys.add(key)
        added.append(entry.dict())

    return {"added": added, "skipped_duplicates": skipped}


@app.get("/children/{child_id}/homework")
async def list_homework(child_id: str, done: str = None):
    query = {"child_id": child_id, "archived": {"$ne": True}}
    if done is not None:
        query["done"] = done.lower() == "true"
    rows = await db.homework.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return rows


@app.post("/children/{child_id}/homework/{homework_id}/toggle-done")
async def toggle_homework_done(child_id: str, homework_id: str):
    row = await db.homework.find_one({"id": homework_id, "child_id": child_id})
    if not row:
        raise HTTPException(404, "Домашното не е намерено")
    new_done = not row.get("done", False)
    await db.homework.update_one({"id": homework_id}, {"$set": {"done": new_done}})
    return {"ok": True, "done": new_done}


@app.post("/children/{child_id}/homework/{homework_id}/archive")
async def archive_homework(child_id: str, homework_id: str):
    res = await db.homework.update_one(
        {"id": homework_id, "child_id": child_id}, {"$set": {"archived": True}}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Домашното не е намерено")
    return {"ok": True}


@app.post("/children/{child_id}/homework/archive-bulk")
async def archive_homework_bulk(child_id: str, payload: dict):
    """scope: "overdue" (чакащи с минал срок) или "all_pending" (всички чакащи)."""
    scope = (payload or {}).get("scope", "overdue")
    if scope not in ("overdue", "all_pending"):
        raise HTTPException(400, "Невалиден scope")
    pending = await db.homework.find(
        {"child_id": child_id, "done": {"$ne": True}, "archived": {"$ne": True}}, {"_id": 0}
    ).to_list(2000)
    today = datetime.utcnow().date()
    ids = []
    for h in pending:
        if scope == "all_pending":
            ids.append(h["id"])
        else:
            due = _try_parse_bg_date(h.get("due_date", ""))
            if due and due.date() < today:
                ids.append(h["id"])
    if ids:
        await db.homework.update_many({"id": {"$in": ids}}, {"$set": {"archived": True}})
    return {"ok": True, "archived_count": len(ids)}


@app.post("/children/{child_id}/homework/{homework_id}/check")
async def check_homework(child_id: str, homework_id: str, payload: HomeworkCheckRequest):
    if not ANTHROPIC_API_KEY:
        raise HTTPException(500, "ANTHROPIC_API_KEY не е зададен на сървъра")

    row = await db.homework.find_one({"id": homework_id, "child_id": child_id})
    if not row:
        raise HTTPException(404, "Домашното не е намерено")

    subject = row.get("subject", "")
    task_text = row.get("task_text", "")
    is_math = "математик" in subject.lower()

    images = payload.images or ([payload.image] if payload.image else [])
    if not images:
        raise HTTPException(400, "Няма приложена снимка")
    scope_note = (
        " Приложени са няколко снимки — по всяка вероятност някои показват печатното "
        "условие (страница от учебник/работен лист с една или повече задачи), а други "
        "показват ръкописното решение. Първо разгледай снимката(ите) с условието и установи "
        "КОНКРЕТНО кои задачи/подточки от нея реално се искат според текста от Школо по-горе "
        "— ако текстът от Школо не уточнява точно кои подточки, приеми че се искат всички "
        "отделни задачи, видими на същата озаглавена страница/секция в учебника (не съседни "
        "несвързани страници). После провери в решението кои от тези конкретни задачи реално "
        "са направени. Не приемай за завършено домашно, ако на снимката с решението личи само "
        "част от поисканото — например само една задача от няколко видими в условието."
        if len(images) > 1 else ""
    )

    details = None
    if is_math:
        # Какво не е било прието при последния неуспешен опит за същото домашно — за да не
        # мине втори опит със същите грешки само защото AI-то е погледнало по-бегло.
        last_failed = await db.homework_checks.find_one(
            {"child_id": child_id, "homework_id": homework_id, "passed": False},
            {"_id": 0, "details": 1}, sort=[("checked_at", -1)],
        )
        previous_issues = [
            t for t in (((last_failed or {}).get("details") or {}).get("tasks") or [])
            if isinstance(t, dict) and t.get("status") != "correct"
        ]
        child = await db.children.find_one({"id": child_id}, {"_id": 0}) or {}
        details = await _check_math_homework(task_text, images, previous_issues, child, child_id)
        passed, feedback = _decide_math_check(details)
    else:
        instruction = (
            f"Ти си насърчаващ учител. Задачата е със следния текст от Школо: "
            f"\"{task_text}\".{scope_note} Провери дали има реален, смислен опит за решаване "
            f"на ВСИЧКО поискано — НЕ оценявай почерк, стил или прецизност. Ако е решена само "
            f"част от поисканото (напр. само една от няколко подточки), отговори с "
            f"passed=false и посочи насърчително кое е свършено и кое остава. Отхвърли "
            f"напълно само ако страницата е празна, драскулки, или напълно нерелевантна на "
            f"задачата. Отговори САМО с валиден JSON от вида "
            f'{{"passed": true/false, "feedback": "кратко насърчително съобщение на '
            f'дете-разбираем език"}}, без никакъв друг текст.'
        )

        content = [{"type": "text", "text": instruction}]
        for img in images:
            media_type, b64 = _parse_data_url(img)
            content.append({"type": "image", "source": {"type": "base64", "media_type": media_type, "data": b64}})

        async with httpx.AsyncClient(timeout=60.0) as client:
            res = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": ANTHROPIC_API_KEY,
                    "anthropic-version": "2023-06-01",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "claude-sonnet-4-6",
                    "max_tokens": 1000,
                    "messages": [{"role": "user", "content": content}],
                },
            )
        if res.status_code != 200:
            raise HTTPException(502, f"Claude API грешка: {res.status_code} {res.text[:300]}")

        data = res.json()
        await _log_ai_usage(child_id, "homework_other", data)
        text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text").strip()
        verdict = _parse_verdict_json(text)

        passed = bool(verdict.get("passed"))
        feedback = verdict.get("feedback", "")

    thumbs = [t for t in (_make_thumb(img) for img in images) if t]
    await db.homework_checks.insert_one(
        HomeworkCheckLog(
            child_id=child_id, homework_id=homework_id, subject=subject,
            passed=passed, feedback=feedback, images=thumbs, details=details,
        ).dict()
    )

    if passed:
        await db.homework.update_one({"id": homework_id}, {"$set": {"done": True}})
        points_result = await _award_points(
            child_id, f"homework_{homework_id}", subject, task_text[:60], 1, 1,
        )
        return {
            "passed": True, "feedback": feedback, "points": points_result["points"],
            "is_jackpot": points_result["is_jackpot"], "same_day_bonus": points_result["same_day_bonus"],
        }

    return {"passed": False, "feedback": feedback, "points": 0}


@app.get("/children/{child_id}/homework/checks")
async def list_homework_checks(child_id: str, limit: int = 30):
    """Последните проверки на домашни (без снимките — те се взимат при отваряне на детайл)."""
    checks = await db.homework_checks.find(
        {"child_id": child_id}, {"_id": 0, "images": 0, "details": 0}
    ).sort("checked_at", -1).to_list(max(1, min(limit, 100)))
    out = []
    for c in checks:
        hw = await db.homework.find_one({"id": c.get("homework_id")}, {"_id": 0}) or {}
        out.append({
            **c,
            "task_text": hw.get("task_text", ""),
            "due_date": hw.get("due_date", ""),
        })
    return out


@app.get("/children/{child_id}/homework/checks/{check_id}")
async def get_homework_check(child_id: str, check_id: str):
    c = await db.homework_checks.find_one({"id": check_id, "child_id": child_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Проверката не е намерена")
    hw = await db.homework.find_one({"id": c.get("homework_id")}, {"_id": 0}) or {}
    return {**c, "task_text": hw.get("task_text", ""), "due_date": hw.get("due_date", "")}


def _try_parse_bg_date(s: str):
    """Опитва да разчете дата от AI-извлечен текст, най-често DD.MM.YYYY."""
    for pattern in (r"(\d{1,2})\.(\d{1,2})\.(\d{4})",):
        m = re.search(pattern, s or "")
        if m:
            try:
                d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
                return datetime(y, mo, d)
            except ValueError:
                return None
    return None


AI_USAGE_LABELS = {
    "homework_math": "Проверка на домашно по математика",
    "homework_other": "Проверка на домашно (други предмети)",
    "notebook": "Тетрадка (термини)",
    "import": "Импорт от Школо",
}


@app.get("/children/{child_id}/ai-usage")
async def ai_usage(child_id: str, month: str = ""):
    """Приблизителен разход за AI заявките на СЕМЕЙСТВОТО за месеца (по подразбиране текущия),
    по вид заявка. Брои само заявките през този сървър — разговорите с Елена минават през
    Cloudflare Worker-а и не влизат тук."""
    month = month or datetime.utcnow().strftime("%Y-%m")
    child = await db.children.find_one({"id": child_id}, {"_id": 0}) or {}
    siblings = [child_id]
    if child.get("family_id"):
        siblings = [c["id"] for c in await db.children.find(
            {"family_id": child["family_id"]}, {"_id": 0, "id": 1}).to_list(50)]
    rows = await db.ai_usage.find(
        {"child_id": {"$in": siblings}, "month": month}, {"_id": 0}).to_list(20000)
    by_kind = {}
    for r in rows:
        k = by_kind.setdefault(r.get("kind", ""), {"count": 0, "cost_usd": 0.0})
        k["count"] += 1
        k["cost_usd"] += float(r.get("cost_usd") or 0)
    total_usd = sum(k["cost_usd"] for k in by_kind.values())
    first = min((r["created_at"] for r in rows if r.get("created_at")), default=None)
    return {
        "month": month,
        "count": len(rows),
        "cost_eur": round(total_usd * USD_TO_EUR, 2),
        "since": first.isoformat() if first else None,
        "by_kind": [
            {"kind": kind, "label": AI_USAGE_LABELS.get(kind, kind), "count": v["count"],
             "cost_eur": round(v["cost_usd"] * USD_TO_EUR, 2),
             "avg_eur": round(v["cost_usd"] * USD_TO_EUR / v["count"], 3) if v["count"] else 0}
            for kind, v in sorted(by_kind.items(), key=lambda kv: -kv[1]["cost_usd"])
        ],
    }


@app.get("/children/{child_id}/homework/stats")
async def homework_stats(child_id: str):
    now = datetime.utcnow()
    week_ago = now - timedelta(days=7)

    all_hw = await db.homework.find({"child_id": child_id, "archived": {"$ne": True}}, {"_id": 0}).to_list(2000)
    checks = await db.homework_checks.find({"child_id": child_id}, {"_id": 0}).to_list(4000)

    pending = [h for h in all_hw if not h.get("done")]
    overdue = 0
    for h in pending:
        due = _try_parse_bg_date(h.get("due_date", ""))
        if due and due.date() < now.date():
            overdue += 1

    done_this_week = 0
    for h in all_hw:
        if not h.get("done"):
            continue
        created = h.get("created_at")
        # created_at е datetime обект от Mongo/pydantic сериализация
        if isinstance(created, str):
            try:
                created = datetime.fromisoformat(created)
            except ValueError:
                created = None
        if created and created >= week_ago:
            done_this_week += 1

    by_subject = {}
    for h in all_hw:
        if not h.get("done"):
            continue
        subj = h.get("subject") or "(без предмет)"
        by_subject[subj] = by_subject.get(subj, 0) + 1

    total_checks = len(checks)
    passed_checks = sum(1 for c in checks if c.get("passed"))
    success_rate = round(100 * passed_checks / total_checks) if total_checks else None

    return {
        "pending_count": len(pending),
        "overdue_count": overdue,
        "done_this_week": done_this_week,
        "done_total": sum(1 for h in all_hw if h.get("done")),
        "by_subject": by_subject,
        "success_rate_pct": success_rate,
        "total_checks": total_checks,
    }


# ---------------- Тетрадка (термини/дефиниции, снимани по време на "Оживи урока") ----------------

NOTEBOOK_TERM_POINTS = 6  # поевтинено на 16.10.2026 (беше 20) — преписването даваше ~60% от точките
NOTEBOOK_BONUS_POINTS = 3  # (беше 10)


@app.get("/children/{child_id}/notebook")
async def get_notebook_entries(child_id: str, kv_key: str = None):
    query = {"child_id": child_id}
    if kv_key:
        query["kv_key"] = kv_key
    rows = await db.notebook.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return rows


@app.post("/children/{child_id}/notebook/check")
async def check_notebook(child_id: str, payload: NotebookCheckRequest):
    if not ANTHROPIC_API_KEY:
        raise HTTPException(500, "ANTHROPIC_API_KEY не е зададен на сървъра")

    # Ако вече е внесен този термин за този урок, не проверяваме повторно.
    existing = await db.notebook.find_one(
        {"child_id": child_id, "kv_key": payload.kv_key, "term": payload.term}
    )
    if existing:
        return {"already_done": True, "points": 0}

    instruction = (
        f"Виждаш снимка на ръкописна тетрадка на дете. То трябваше да запише: "
        f"термин \"{payload.term}\" с определение \"{payload.definition}\". "
        f"Провери ЩЕДРО дали има реален, разпознаваем опит да препише термина и "
        f"определението (не оценявай почерк/точност на всяка дума — само дали е "
        f"направен истински опит, не празно/драскулки/нерелевантен текст). Провери "
        f"ОТДЕЛНО дали ДОПЪЛНИТЕЛНО има собствено обяснение на детето със свои думи "
        f"(извън простото преписване на определението) — това е бонус, не е "
        f"задължително. Отговори САМО с валиден JSON от вида "
        f'{{"passed": true/false, "has_bonus": true/false, "feedback": "кратко '
        f'насърчително съобщение на дете-разбираем език"}}, без никакъв друг текст.'
    )

    media_type, b64 = _parse_data_url(payload.image)
    content = [
        {"type": "text", "text": instruction},
        {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": b64}},
    ]

    async with httpx.AsyncClient(timeout=120.0) as client:
        res = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            json={
                "model": "claude-sonnet-4-6",
                "max_tokens": 1000,
                "messages": [{"role": "user", "content": content}],
            },
        )
    if res.status_code != 200:
        raise HTTPException(502, f"Claude API грешка: {res.status_code} {res.text[:300]}")

    data = res.json()
    await _log_ai_usage(child_id, "notebook", data)
    text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text").strip()
    verdict = _parse_verdict_json(text)

    passed = bool(verdict.get("passed"))
    has_bonus = bool(verdict.get("has_bonus"))
    feedback = verdict.get("feedback", "")

    if not passed:
        return {"passed": False, "feedback": feedback, "points": 0}

    await db.notebook.insert_one(
        NotebookEntry(
            child_id=child_id, kv_key=payload.kv_key, term=payload.term,
            has_bonus_explanation=has_bonus, feedback=feedback,
        ).dict()
    )
    points_value = NOTEBOOK_TERM_POINTS + (NOTEBOOK_BONUS_POINTS if has_bonus else 0)
    points_result = await _award_fixed_points(
        child_id, f"notebook_{payload.kv_key}_{payload.term}", "", payload.term, points_value,
    )
    return {
        "passed": True, "has_bonus": has_bonus, "feedback": feedback, "points": points_result["points"],
        "is_jackpot": points_result["is_jackpot"], "same_day_bonus": points_result["same_day_bonus"],
    }


# ---------------- Страница за внос (родителят я отваря от компютъра си) ----------------

IMPORT_PAGE_HTML = """<!DOCTYPE html>
<html lang="bg">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Внос на домашни</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; background:#FFF9F0; color:#2C2C2A; max-width:640px; margin:0 auto; padding:24px 16px; }
  h1 { font-size:20px; }
  select, button, input[type=file] { font-size:16px; padding:10px; border-radius:10px; border:1px solid #E8E0D0; width:100%; box-sizing:border-box; margin-bottom:12px; }
  button { background:#4A90D9; color:#fff; border:none; font-weight:700; cursor:pointer; }
  button:disabled { background:#ccc; }
  .card { background:#fff; border:1px solid #E8E0D0; border-radius:12px; padding:16px; margin-bottom:16px; }
  .row { display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #eee; }
  .muted { color:#888780; font-size:13px; }
  #pasteZone { border:2px dashed #4A90D9; border-radius:12px; padding:24px; text-align:center; cursor:pointer; margin-bottom:12px; background:#F0F6FC; }
  #pasteZone:focus { outline:2px solid #4A90D9; }
  #thumbs { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:8px; }
  #thumbs img { width:70px; height:70px; object-fit:cover; border-radius:8px; border:1px solid #E8E0D0; }
  .thumbWrap { position:relative; }
  .thumbWrap button { position:absolute; top:-6px; right:-6px; width:22px; height:22px; padding:0; border-radius:50%; font-size:12px; line-height:1; margin:0; }
  #status { font-size:14px; margin-top:8px; }
</style>
</head>
<body>
<h1>📚 Внос на домашни от Школо</h1>

<div class="card">
  <label>Семеен код</label>
  <input id="familyCode" placeholder="напр. AB12CD" style="font-size:16px;padding:10px;border-radius:10px;border:1px solid #E8E0D0;width:100%;box-sizing:border-box;margin-bottom:12px;text-transform:uppercase">
  <button onclick="loadChildren()">Зареди децата</button>
</div>

<div class="card" id="childCard" style="display:none">
  <label>Дете</label>
  <select id="childSelect" onchange="clearResults()"></select>
</div>

<div class="card" id="uploadCard" style="display:none">
  <label>Снимки от Школо (детайлната таблица, не sidebar баджа)</label>
  <div id="pasteZone" tabindex="0">📋 Кликни тук и натисни <b>Ctrl+V</b>, за да поставиш скрийншот<br><span class="muted">(Win+Shift+S прави снимка директно в clipboard-а — не се налага да я записваш никъде)</span></div>
  <div id="thumbs"></div>
  <div class="muted" style="margin:8px 0">— или, ако предпочиташ —</div>
  <input type="file" id="files" accept="image/*" multiple>
  <button onclick="doImport()">Разпознай и внеси</button>
  <div id="status"></div>
</div>

<div id="results"></div>

<script>
const BASE = window.location.origin;
let children = [];
let pastedImages = []; // data URLs, добавени чрез Ctrl+V

function addThumb(dataUrl) {
  pastedImages.push(dataUrl);
  renderThumbs();
}

function renderThumbs() {
  const el = document.getElementById('thumbs');
  el.innerHTML = pastedImages.map((src, i) =>
    `<div class="thumbWrap"><img src="${src}"><button onclick="removeThumb(${i})">✕</button></div>`
  ).join('');
}

function removeThumb(i) {
  pastedImages.splice(i, 1);
  renderThumbs();
}

document.getElementById('pasteZone').addEventListener('paste', (e) => {
  const items = e.clipboardData?.items || [];
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const blob = item.getAsFile();
      const reader = new FileReader();
      reader.onload = () => addThumb(reader.result);
      reader.readAsDataURL(blob);
    }
  }
});

async function loadChildren(preselectChildId) {
  const code = document.getElementById('familyCode').value.trim().toUpperCase();
  if (!code) return;
  const res = await fetch(`${BASE}/families/join`, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({code})
  });
  const data = await res.json();
  if (!data.children || data.children.length === 0) {
    alert('Няма деца в това семейство или грешен код.');
    return;
  }
  children = data.children;
  const sel = document.getElementById('childSelect');
  sel.innerHTML = children.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  if (typeof preselectChildId === 'string' && children.some(c => c.id === preselectChildId)) {
    sel.value = preselectChildId;
  }
  document.getElementById('childCard').style.display = 'block';
  document.getElementById('uploadCard').style.display = 'block';
  clearResults();
}

// Когато страницата е отворена от приложението, кодът и детето идват в линка — не се питат повторно
(function autoLoadFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) return;
  document.getElementById('familyCode').value = code.toUpperCase();
  loadChildren(params.get('child') || undefined);
})();

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function clearResults() {
  document.getElementById('results').innerHTML = '';
  document.getElementById('status').textContent = '';
}

async function doImport() {
  const childId = document.getElementById('childSelect').value;
  const files = document.getElementById('files').files;
  const fromFiles = await Promise.all(Array.from(files).map(fileToDataUrl));
  const images = [...pastedImages, ...fromFiles];
  if (!images.length) { alert('Постни (Ctrl+V) или избери поне една снимка.'); return; }
  clearResults();
  document.getElementById('status').textContent = 'Разпознавам... (може да отнеме до минута)';
  try {
    const res = await fetch(`${BASE}/children/${childId}/homework/import`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({images})
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Грешка');
    document.getElementById('status').textContent = '';
    const results = document.getElementById('results');
    const childName = children.find(c => c.id === childId)?.name || '';
    let html = `<div class="card"><b>${childName}</b> — намерени ${data.added.length} нови`;
    if (data.skipped_duplicates) html += `, ${data.skipped_duplicates} вече бяха внесени`;
    html += `</div>`;
    html += `<div class="card" style="background:#EAF6EA"><b>✅ Готово.</b> Върни се в приложението (бутона за последно отворени приложения) — списъкът ще се опресни сам.</div>`;
    for (const hw of data.added) {
      html += `<div class="card"><div class="row"><b>${hw.subject || '(предмет?)'}</b><span class="muted">срок: ${hw.due_date || '?'}</span></div><div>${hw.task_text}</div></div>`;
    }
    results.innerHTML = html;
    pastedImages = [];
    renderThumbs();
    document.getElementById('files').value = '';
  } catch (e) {
    document.getElementById('status').textContent = 'Грешка: ' + e.message;
  }
}
</script>
</body>
</html>
"""


@app.get("/import", response_class=HTMLResponse)
async def import_page():
    return IMPORT_PAGE_HTML
