from typing import List, Optional

from pydantic import BaseModel


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
    created_at: Optional[str] = None
