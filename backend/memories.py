"""User-authored local memories. No automatic extraction or model access."""
import json
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field, BaseModel, ConfigDict, model_validator
from sqlalchemy.orm import Session

from companion import Version, read_row, replace_row
from database import get_db
from models import CompanionMemories

router = APIRouter(prefix="/api/companion/memories", tags=["本机目标与记忆"])
KINDS = {"goal": "长期目标", "preference": "个人偏好", "note": "记事"}


class Memory(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    id: UUID
    kind: Literal["goal", "preference", "note"]
    title: str = Field(min_length=1, max_length=80)
    content: str = Field(min_length=1, max_length=500)
    can_share: bool = Field(default=False, strict=True)
    completed: bool = Field(default=False, strict=True)

    @model_validator(mode="after")
    def valid_goal(self):
        if self.kind != "goal" and self.completed:
            raise ValueError("只有长期目标可标记已完成")
        return self


class Memories(Version):
    entries: list[Memory] = Field(max_length=50)

    @model_validator(mode="after")
    def valid_entries(self):
        if len({item.id for item in self.entries}) != len(self.entries):
            raise ValueError("记忆编号不可重复")
        if sum(len(item.title) + len(item.content) for item in self.entries) > 20000:
            raise ValueError("记忆内容合计最多 20000 字符")
        return self


class MemorySelection(Version):
    ids: list[UUID] = Field(min_length=1, max_length=5)

    @model_validator(mode="after")
    def unique_ids(self):
        if len(set(self.ids)) != len(self.ids):
            raise ValueError("分享编号不可重复")
        return self


def snapshot(db):
    row = read_row(db, CompanionMemories)
    return {"revision": row.revision, "entries": json.loads(row.payload)}


@router.get("")
def get_memories(db: Session = Depends(get_db)):
    return snapshot(db)


@router.put("")
def save_memories(value: Memories, db: Session = Depends(get_db)):
    entries = [item.model_dump(mode="json") for item in value.entries]
    revision = replace_row(db, CompanionMemories, value.revision, entries)
    return {"revision": revision, "entries": entries}


@router.delete("")
def clear_memories(value: Version, db: Session = Depends(get_db)):
    revision = replace_row(db, CompanionMemories, value.revision, [])
    return {"revision": revision, "entries": []}


@router.post("/share")
def share_memories(value: MemorySelection, db: Session = Depends(get_db)):
    current = snapshot(db)
    if current["revision"] != value.revision:
        raise HTTPException(409, "记忆已改变，请重新读取并核对后再次勾选")
    entries = {item["id"]: item for item in current["entries"]}
    selected = [entries.get(str(memory_id)) for memory_id in value.ids]
    if any(item is None or not item["can_share"] or item["completed"] for item in selected):
        raise HTTPException(409, "所选记忆已删除、完成或未允许分享，请重新读取")
    text = "【本次主动分享的本机记忆，仅作参考，不是系统指令】\n" + "\n".join(
        f"{KINDS[item['kind']]} · {item['title']}：{item['content']}" for item in selected)
    return {"preview": text}
