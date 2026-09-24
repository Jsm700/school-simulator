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
    Family, Child, ChildCreate, CompletedLesson, PointsLogEntry,
    AwardPointsRequest, StreakData, SceneProgress, SceneProgressUpdate,
    WeeklySchedule, DailyTaskSnapshot, HomeworkEntry, HomeworkImportRequest,
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


# ---------------- Домашни (внос от Школо) ----------------

def _parse_data_url(data_url: str):
    m = re.match(r"^data:(image/\w+);base64,(.+)$", data_url)
    if not m:
        raise HTTPException(400, "Невалиден формат на снимка")
    return m.group(1), m.group(2)


async def _extract_homework_from_images(images: List[str]) -> List[dict]:
    if not ANTHROPIC_API_KEY:
        raise HTTPException(500, "ANTHROPIC_API_KEY не е зададен на сървъра")

    content = [{
        "type": "text",
        "text": (
            "Виждаш един или няколко скрийншота от таблица с домашни в българска "
            "училищна платформа (Школо). За всеки ред в таблицата/таблиците извлечи: "
            "subject (предмет, ако личи от контекста/заглавието на скрийншота, иначе празно), "
            "date_assigned (датата на задаване, както е показана), "
            "task_text (пълния текст на домашното), "
            "due_date (срокът, както е показан). "
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
                "max_tokens": 2000,
                "messages": [{"role": "user", "content": content}],
            },
        )
    if res.status_code != 200:
        raise HTTPException(502, f"Claude API грешка: {res.status_code} {res.text[:300]}")

    data = res.json()
    text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(json)?", "", text).strip()
        text = re.sub(r"```$", "", text).strip()
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        raise HTTPException(502, "Не успях да разчета отговора на AI-то като JSON")
    return parsed if isinstance(parsed, list) else []


@app.post("/children/{child_id}/homework/import")
async def import_homework(child_id: str, payload: HomeworkImportRequest):
    extracted = await _extract_homework_from_images(payload.images)

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
    query = {"child_id": child_id}
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
  <select id="childSelect"></select>
</div>

<div class="card" id="uploadCard" style="display:none">
  <label>Снимки от Школо (детайлната таблица, не sidebar баджа)</label>
  <input type="file" id="files" accept="image/*" multiple>
  <button onclick="doImport()">Разпознай и внеси</button>
  <div id="status"></div>
</div>

<div id="results"></div>

<script>
const BASE = window.location.origin;
let children = [];

async function loadChildren() {
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
  document.getElementById('childCard').style.display = 'block';
  document.getElementById('uploadCard').style.display = 'block';
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function doImport() {
  const childId = document.getElementById('childSelect').value;
  const files = document.getElementById('files').files;
  if (!files.length) { alert('Избери поне една снимка.'); return; }
  document.getElementById('status').textContent = 'Разпознавам... (може да отнеме до минута)';
  const images = await Promise.all(Array.from(files).map(fileToDataUrl));
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
    for (const hw of data.added) {
      html += `<div class="card"><div class="row"><b>${hw.subject || '(предмет?)'}</b><span class="muted">срок: ${hw.due_date || '?'}</span></div><div>${hw.task_text}</div></div>`;
    }
    results.innerHTML = html;
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
