"""Explicit local snapshots and preferences; never invokes a model service."""
import json
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import update
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.orm import Session
from database import get_db
from models import CompanionHistory, CompanionPreferences, CompanionMemories

router = APIRouter(prefix="/api/companion", tags=["本机陪伴数据"])


class Version(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(ge=0, le=2**53 - 2, strict=True)


class Message(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: int = Field(gt=0, le=10**12, strict=True)
    role: Literal["user", "assistant"]
    content: str = Field(max_length=16000)
    status: Literal["complete", "cancelled", "error"] | None = None


class History(Version):
    messages: list[Message] = Field(max_length=100)

    @model_validator(mode="after")
    def validate_turns(self):
        if len(self.messages) % 2 or len({item.id for item in self.messages}) != len(self.messages):
            raise ValueError("对话必须为完整消息对，编号不可重复")
        if sum(len(item.content) for item in self.messages) > 100000:
            raise ValueError("存档超过字符上限")
        for index, item in enumerate(self.messages):
            if index % 2 == 0:
                if item.role != "user" or not item.content.strip() or len(item.content) > 4000 or item.status is not None:
                    raise ValueError("用户消息格式错误")
            elif item.role != "assistant" or item.status is None or (item.status == "complete" and not item.content.strip()):
                raise ValueError("回复格式错误")
        return self


class Preferences(Version):
    nickname: str = Field(default="", max_length=40)
    tone: Literal["gentle", "direct"] = "gentle"
    goal: str = Field(default="", max_length=300)


def read_row(db, model):
    db.execute(insert(model).values(id=1, revision=0, payload="{}" if model is CompanionPreferences else "[]").on_conflict_do_nothing(index_elements=["id"]))
    db.commit()
    return db.get(model, 1)


def replace_row(db, model, revision, payload):
    read_row(db, model)
    result = db.execute(update(model).where(model.id == 1, model.revision == revision)
                        .values(revision=revision + 1, payload=json.dumps(payload, ensure_ascii=False)))
    if result.rowcount != 1:
        db.rollback()
        raise HTTPException(409, "本机数据已在其他窗口改变，请重新读取后再操作")
    db.commit()
    return revision + 1


@router.get("/history")
def get_history(db: Session = Depends(get_db)):
    row = read_row(db, CompanionHistory)
    return {"revision": row.revision, "messages": json.loads(row.payload)}


@router.put("/history")
def save_history(value: History, db: Session = Depends(get_db)):
    messages = [item.model_dump(exclude_none=True) for item in value.messages]
    revision = replace_row(db, CompanionHistory, value.revision, messages)
    return {"revision": revision, "messages": messages}


@router.delete("/history")
def delete_history(value: Version, db: Session = Depends(get_db)):
    revision = replace_row(db, CompanionHistory, value.revision, [])
    return {"revision": revision, "messages": []}


@router.get("/preferences")
def get_preferences(db: Session = Depends(get_db)):
    row = read_row(db, CompanionPreferences)
    return Preferences(revision=row.revision, **json.loads(row.payload))


@router.put("/preferences")
def save_preferences(value: Preferences, db: Session = Depends(get_db)):
    data = value.model_dump(exclude={"revision"})
    revision = replace_row(db, CompanionPreferences, value.revision, data)
    return {"revision": revision, **data}


@router.delete("/preferences")
def delete_preferences(value: Version, db: Session = Depends(get_db)):
    revision = replace_row(db, CompanionPreferences, value.revision, {})
    return Preferences(revision=revision)
