"""Gemini API 호출. 데이터 요약을 시스템 프롬프트에 주입한다(컨텍스트 주입)."""
import json
from functools import lru_cache
from typing import List

from google import genai
from google.genai import types

from core import config
from core.utils import today_kst

SYSTEM_TEMPLATE = """너는 '껌냥이 트레이너'야. 사용자의 컨디션 기록을 알고 있는 검은 고양이 운동·건강 코치야.

[말투]
- 친근한 반말. 문장 끝에 가끔 '~냥'을 붙이되 과하지 않게.

[역할]
1. 오늘의 컨디션·스트레스·수면·목적에 맞는 운동 추천 (운동 이름, 시간 또는 세트, 강도, 주의할 점)
2. 건강 상태에 맞는 건강 주스 레시피 추천 (재료와 분량, 만드는 법, 일반적인 기대 효과)
3. 기록 데이터에 대한 질문에 수치를 근거로 답하기

[규칙]
- 아래 [사용자 데이터 요약]의 수치를 근거로 답하고, 어떤 기록을 참고했는지 한 줄로 밝혀.
- 컨디션 4 이하이거나 수면 5시간 미만이면 고강도 운동 대신 회복 위주로 추천해.
- 의학적 진단·치료는 하지 마. 통증이 계속되거나 질환·알레르기가 있으면 전문가 상담을 권해.
- 요약에 없는 정보는 지어내지 말고, 오늘 컨디션 체크를 해 달라고 안내해.
- 모바일에서 읽기 좋게 짧은 단락과 목록으로 답해.

[오늘 날짜] {today}

[사용자 데이터 요약]
{summary}
"""

HISTORY_LIMIT = 20


@lru_cache
def _client() -> genai.Client:
    if not config.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY가 설정되지 않았습니다.")
    return genai.Client(api_key=config.GEMINI_API_KEY)


def build_system_prompt(summary_text: str) -> str:
    return SYSTEM_TEMPLATE.format(today=today_kst(), summary=summary_text)


def _to_content(role: str, text: str) -> types.Content:
    # Gemini는 assistant 대신 "model"이라는 역할 이름을 쓴다
    return types.Content(
        role="model" if role == "assistant" else "user",
        parts=[types.Part(text=text)],
    )


def chat(summary_text: str, history: List[dict], user_message: str) -> str:
    contents = [_to_content(m["role"], m["content"]) for m in history[-HISTORY_LIMIT:]]
    contents.append(_to_content("user", user_message))

    res = _client().models.generate_content(
        model=config.GEMINI_MODEL,
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=build_system_prompt(summary_text),
            temperature=0.7,
        ),
    )
    return (res.text or "").strip()


def generate_playlist(entry: dict) -> List[dict]:
    prompt = (
        f"오늘 사용자는 스트레스 {entry.get('stress')}/10, 컨디션 {entry.get('value')}/10, "
        f"수면 {entry.get('sleep_hours')}시간이고 메모는 '{entry.get('memo') or '없음'}'이야.\n"
        "긴장을 풀고 기분을 전환할 수 있는 실제로 존재하는 유명한 곡 5개를 추천해. "
        "한국 곡과 해외 곡을 섞어 줘. 가사는 쓰지 마.\n"
        '{"songs": [{"title": "곡명", "artist": "아티스트", "reason": "추천 이유 한 문장"}]} 형식으로 답해.'
    )
    res = _client().models.generate_content(
        model=config.GEMINI_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",  # JSON만 돌려받기
            temperature=0.8,
        ),
    )
    songs = json.loads(res.text).get("songs", [])
    return [
        {"title": str(s.get("title", "")), "artist": str(s.get("artist", "")), "reason": str(s.get("reason", ""))}
        for s in songs
        if s.get("title")
    ][:5]