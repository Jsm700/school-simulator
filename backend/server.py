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
    WeeklySchedule, DailyTaskSnapshot, HomeworkEntry, HomeworkImportRequest, HomeworkCheckRequest,
    HomeworkCheckLog,
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


async def _award_points(child_id: str, lesson_key: str, subject: str, lesson_title: str,
                         topics_total: int, topics_covered: int) -> dict:
    safe_total = max(1, topics_total or 1)
    safe_covered = max(0, min(topics_covered, safe_total))
    complete = safe_covered >= safe_total

    base_points = round((safe_covered / safe_total) * safe_total * POINTS_PER_TOPIC)
    bonus = COMPLETION_BONUS if complete else 0
    streak_points, current_streak = await update_streak(child_id)
    total_points = base_points + bonus + streak_points

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
    return {**entry.dict(), "current_streak": current_streak}


@app.get("/children/{child_id}/points")
async def get_points(child_id: str):
    log = await db.points_log.find({"child_id": child_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    total = sum(e.get("points", 0) for e in log)
    return {"total": total, "log": log}


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

    if is_math:
        instruction = (
            f"Ти си строг учител по математика. На снимката е показано решение на "
            f"задача със следния текст от Школо: \"{task_text}\". Провери дали конкретният "
            f"отговор/решение на снимката е ПРАВИЛЕН. Отговори САМО с валиден JSON от вида "
            f'{{"passed": true/false, "feedback": "кратко обяснение защо (1-2 изречения, на '
            f'дете-разбираем език)"}}, без никакъв друг текст."'
        )
    else:
        instruction = (
            f"Ти си насърчаващ учител. Виждаш снимка на свършено домашно със задача от Школо: "
            f"\"{task_text}\". Провери САМО дали има реален, смислен опит за решаване — НЕ "
            f"оценявай почерк, стил или прецизност. Отхвърли само ако страницата е празна, "
            f"драскулки, или напълно нерелевантна на задачата. Отговори САМО с валиден JSON от "
            f'вида {{"passed": true/false, "feedback": "кратко насърчително съобщение на '
            f'дете-разбираем език"}}, без никакъв друг текст.'
        )

    media_type, b64 = _parse_data_url(payload.image)
    content = [
        {"type": "text", "text": instruction},
        {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": b64}},
    ]

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
                "max_tokens": 500,
                "messages": [{"role": "user", "content": content}],
            },
        )
    if res.status_code != 200:
        raise HTTPException(502, f"Claude API грешка: {res.status_code} {res.text[:300]}")

    data = res.json()
    text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(json)?", "", text).strip()
        text = re.sub(r"```$", "", text).strip()
    try:
        verdict = json.loads(text)
    except json.JSONDecodeError:
        raise HTTPException(502, "Не успях да разчета отговора на AI-то")

    passed = bool(verdict.get("passed"))
    feedback = verdict.get("feedback", "")

    await db.homework_checks.insert_one(
        HomeworkCheckLog(
            child_id=child_id, homework_id=homework_id, subject=subject,
            passed=passed, feedback=feedback,
        ).dict()
    )

    if passed:
        await db.homework.update_one({"id": homework_id}, {"$set": {"done": True}})
        points_result = await _award_points(
            child_id, f"homework_{homework_id}", subject, task_text[:60], 1, 1,
        )
        return {"passed": True, "feedback": feedback, "points": points_result["points"]}

    return {"passed": False, "feedback": feedback, "points": 0}


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


@app.get("/children/{child_id}/homework/stats")
async def homework_stats(child_id: str):
    now = datetime.utcnow()
    week_ago = now - timedelta(days=7)

    all_hw = await db.homework.find({"child_id": child_id}, {"_id": 0}).to_list(2000)
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
  clearResults();
}

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
