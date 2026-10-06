from typing import List

from fastapi import APIRouter, HTTPException

from schemas.playlist import PlaylistOut
from services import playlist_service

router = APIRouter(prefix="/api/playlists", tags=["스트레스 날 음악"])


@router.get("", response_model=List[PlaylistOut], summary="자동 저장된 음악 목록")
def list_playlists():
    return playlist_service.list_playlists()


@router.delete("/{pid}", summary="음악 목록 삭제")
def delete_playlist(pid: str):
    if not playlist_service.delete_playlist(pid):
        raise HTTPException(404, "목록을 찾을 수 없습니다.")
    return {"deleted": pid}
