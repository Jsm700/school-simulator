# backend/server.py
# Backend за Училищен Симулатор — семеен код + детски профили, точки, прогрес,
# сцена-прогрес, седмичен график, дневни задачи. Заменя AsyncStorage-базираните
# services/*.js в клиента — същата логика, преместена тук, четена/писана от
# няколко устройства (родителско + детски).

import os
import random
import string
from datetime import datetime, timedelta
from typing import List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient

from models import (
    Family, Child, ChildCreate, CompletedLesson, PointsLogEntry,
    AwardPointsRequest, StreakData, SceneProgress, SceneProgressUpdate,
    WeeklySchedule, DailyTaskSnapshot,
)

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ.get("DB_NAME", "simulator")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="Uchilishten Simulator Backend")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

POINTS_PER_TOPIC = 10
COMPLETION_BONUS = 5
STREAK_POINTS_PER_DAY = 2
STREAK_MAX_BONUS = 20


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
    today = today_str()
    streak = await db.streaks.find_one({"child_id": child_id})
    if streak and streak.get("last_active_date") == today:
        return 0, streak.get("current_streak", 0)

    yesterday = (datetime.utcnow() - timedelta(days=1)).strftime("%Y-%m-%d")
    prev_streak = streak.get("current_streak", 0) if streak else 0
    prev_date = streak.get("last_active_date") if streak else None
    new_streak = prev_streak + 1 if prev_date == yesterday else 1

    await db.streaks.update_one(
        {"child_id": child_id},
        {"$set": {"child_id": child_id, "last_active_date": today, "current_streak": new_streak}},
        upsert=True,
    )
    streak_points = min(new_streak * STREAK_POINTS_PER_DAY, STREAK_MAX_BONUS)
    return streak_points, new_streak


@app.get("/children/{child_id}/points")
async def get_points(child_id: str):
    log = await db.points_log.find({"child_id": child_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    total = sum(e.get("points", 0) for e in log)
    return {"total": total, "log": log}


@app.post("/children/{child_id}/points/award")
async def award_points(child_id: str, payload: AwardPointsRequest):
    safe_total = max(1, payload.topics_total or 1)
    safe_covered = max(0, min(payload.topics_covered, safe_total))
    complete = safe_covered >= safe_total

    base_points = round((safe_covered / safe_total) * safe_total * POINTS_PER_TOPIC)
    bonus = COMPLETION_BONUS if complete else 0
    streak_points, current_streak = await update_streak(child_id)
    total_points = base_points + bonus + streak_points

    entry = PointsLogEntry(
        child_id=child_id,
        date=today_str(),
        lesson_key=payload.lesson_key,
        subject=payload.subject,
        lesson_title=payload.lesson_title,
        topics_total=safe_total,
        topics_covered=safe_covered,
        complete=complete,
        points=total_points,
    )
    await db.points_log.insert_one(entry.dict())
    return {**entry.dict(), "current_streak": current_streak}


@app.post("/children/{child_id}/points/reset")
async def reset_points(child_id: str):
    await db.points_log.delete_many({"child_id": child_id})
    await db.streaks.delete_many({"child_id": child_id})
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
