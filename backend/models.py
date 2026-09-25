# backend/models.py
# Data models за семейния/child-базиран backend на Училищен Симулатор.
# Заменя AsyncStorage-based данните (points.js, progress.js, schedule.js,
# dailyTasks.js, sceneProgress.js) с общо, сървърно място, четено от няколко
# устройства (родителско + детски).

from pydantic import BaseModel, Field
from typing import Optional, Dict, List
from datetime import datetime
import uuid


def new_id() -> str:
    return str(uuid.uuid4())


# ---------- Family / Children ----------

class Family(BaseModel):
    id: str = Field(default_factory=new_id)
    code: str  # кратък, лесен за въвеждане код (напр. 6 главни букви/цифри)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Child(BaseModel):
    id: str = Field(default_factory=new_id)
    family_id: str
    name: str
    gender: str = "male"  # "male" | "female"
    grade: str = "4"
    publisher_map: Dict[str, str] = Field(default_factory=dict)  # subject -> publisher
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ChildCreate(BaseModel):
    name: str
    gender: str = "male"
    grade: str = "4"


# ---------- Progress (завършени уроци) ----------

class CompletedLesson(BaseModel):
    id: str = Field(default_factory=new_id)
    child_id: str
    kv_key: str
    completed_at: datetime = Field(default_factory=datetime.utcnow)


# ---------- Точки ----------

class PointsLogEntry(BaseModel):
    id: str = Field(default_factory=new_id)
    child_id: str
    date: str  # YYYY-MM-DD
    lesson_key: str
    subject: str = ""
    lesson_title: str = ""
    topics_total: int = 1
    topics_covered: int = 0
    complete: bool = False
    points: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)


class AwardPointsRequest(BaseModel):
    lesson_key: str
    subject: str = ""
    lesson_title: str = ""
    topics_total: int = 1
    topics_covered: int = 0


class StreakData(BaseModel):
    child_id: str
    last_active_date: Optional[str] = None
    current_streak: int = 0


# ---------- Сцена-прогрес (Оживи урока) ----------

class SceneProgress(BaseModel):
    child_id: str
    kv_key: str
    scene_index: int = 0
    total: int = 0
    choices: Dict[str, dict] = Field(default_factory=dict)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class SceneProgressUpdate(BaseModel):
    scene_index: int
    total: int
    choices: Dict[str, dict] = Field(default_factory=dict)


# ---------- Седмичен график ----------

class WeeklySchedule(BaseModel):
    child_id: str
    schedule: Dict[str, List[int]] = Field(default_factory=dict)  # subject -> [1-5]


# ---------- Дневна снимка на задачите ----------

class DailyTaskSnapshot(BaseModel):
    child_id: str
    date: str  # YYYY-MM-DD
    assignments: Dict[str, dict] = Field(default_factory=dict)  # subject -> lesson obj


# ---------- Домашни (внос от Школо през скрийншоти) ----------

class HomeworkEntry(BaseModel):
    id: str = Field(default_factory=new_id)
    child_id: str
    subject: str = ""
    date_assigned: str = ""
    task_text: str = ""
    due_date: str = ""
    done: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)


class HomeworkImportRequest(BaseModel):
    images: List[str]  # data URLs (base64), напр. "data:image/png;base64,...."


class HomeworkCheckRequest(BaseModel):
    image: str  # data URL, снимка на готовото домашно


class HomeworkCheckLog(BaseModel):
    id: str = Field(default_factory=new_id)
    child_id: str
    homework_id: str
    subject: str = ""
    passed: bool = False
    feedback: str = ""
    checked_at: datetime = Field(default_factory=datetime.utcnow)


# ---------- Тетрадка (термини/дефиниции, снимани по време на "Оживи урока") ----------

class NotebookEntry(BaseModel):
    id: str = Field(default_factory=new_id)
    child_id: str
    kv_key: str  # урокът, към който принадлежи терминът
    term: str
    has_bonus_explanation: bool = False
    feedback: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)


class NotebookCheckRequest(BaseModel):
    kv_key: str
    term: str
    definition: str
    image: str  # data URL

