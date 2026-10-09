from typing import List, Optional

from pydantic import BaseModel, Field


class Song(BaseModel):
    title: str
    artist: str
    reason: str = ""


class PlaylistOut(BaseModel):
    id: str
    date: str
    stress: int
    data_id: Optional[str] = None
    songs: List[Song]
    source: Optional[str] = Field(None, description="ai: Gemini가 고른 곡 / fallback: AI 실패로 기본 곡 저장")
    created_at: Optional[str] = None
