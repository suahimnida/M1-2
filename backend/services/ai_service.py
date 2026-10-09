"""Gemini API 호출. 데이터 요약을 시스템 프롬프트에 주입한다(컨텍스트 주입).

- 빠른 버튼(mode)으로 온 요청만 운동 추천 / 주스 레시피 / 흐름 분석을 해준다.
- 일반 채팅은 메시지에 맞게 답하고, 위 세 주제를 언급하면 해당 버튼을 누르라고 권한다.
"""
import json
import re
import time
from functools import lru_cache
from typing import List, Optional

from google import genai
from google.genai import errors, types

from core import config
from core.utils import today_kst

BASE_TEMPLATE = """너는 '껌냥이 트레이너'야. 사용자의 컨디션 기록을 알고 있는 검은 고양이 운동·건강 코치야.

[말투]
- 친근한 반말. 문장 끝에 가끔 '~냥'을 붙이되 과하지 않게.

[공통 규칙]
- 아래 [사용자 데이터 요약]의 수치를 근거로 답해. 요약에 없는 정보는 지어내지 마.
- 의학적 진단·치료는 하지 마. 통증이 계속되거나 질환·알레르기가 있으면 전문가 상담을 권해.
- 몸무게는 숫자로만 다루고 외모를 평가하거나 무리한 감량을 부추기지 마.
- 모바일에서 읽기 좋게 짧은 단락과 목록으로 답해.

[오늘 날짜] {today}

[사용자 데이터 요약]
{summary}

[이번 요청]
{task}
"""

# 빠른 버튼별 작업 지시
MODE_TASKS = {
    "workout": """'오늘 운동 추천' 버튼 요청이야.
- 가장 최근 기록의 컨디션·스트레스·수면·목적에 맞는 오늘의 운동을 추천해.
- 운동 이름, 시간 또는 세트, 강도, 주의할 점을 목록으로.
- 컨디션 4 이하이거나 수면 5시간 미만이면 고강도 대신 회복 위주로.
- 첫 줄에 어떤 기록을 참고했는지 한 줄로 밝혀.""",
    "juice": """'주스 레시피' 버튼 요청이야.
- 최근 컨디션·스트레스·수면 상태에 맞는 건강 주스 레시피 1~2개를 추천해.
- 재료와 분량, 만드는 법, 일반적인 기대 효과를 적어.
- 첫 줄에 어떤 기록을 참고했는지 한 줄로 밝혀.""",
    "trend": """'최근 흐름 분석' 버튼 요청이야.
- 최근 7일과 직전 7일을 비교해서 컨디션, 스트레스, 수면, 몸무게(기록이 있으면)의 흐름을 분석해.
- 눈에 띄는 패턴(예: 수면과 컨디션의 관계, 요일별 차이)과 다음 주에 해볼 만한 작은 실천 1~2개를 제안해.
- 수치를 꼭 함께 적어.""",
}

FREE_TASK = """사용자가 직접 입력한 일반 메시지야. 메시지 내용에 맞게 자연스럽게 대화해.
- 질문에는 기록 수치를 근거로 짧게 답해.
- 운동 추천이나 운동 루틴, 주스·음료 레시피, 최근 컨디션 흐름 분석은 여기서 자세히 해주지 마.
  이런 주제를 언급하면 한두 문장으로 공감한 뒤, 화면 아래 해당 버튼
  ('오늘 운동 추천', '주스 레시피', '최근 흐름 분석')을 눌러 달라고 권해.{hint}"""

# 일반 채팅에서 버튼 주제를 언급했는지 판단하는 단어들
TOPIC_KEYWORDS = {
    "workout": ("운동", "헬스", "스트레칭", "러닝", "달리기", "조깅", "요가", "필라테스", "근력",
                "근육", "스쿼트", "플랭크", "홈트", "유산소", "걷기", "산책", "루틴"),
    "juice": ("주스", "쥬스", "스무디", "레시피", "음료", "착즙", "녹즙"),
    "trend": ("흐름", "추세", "추이", "분석", "트렌드", "변화", "통계", "그래프"),
}
TOPIC_BUTTON = {"workout": "오늘 운동 추천", "juice": "주스 레시피", "trend": "최근 흐름 분석"}

HISTORY_LIMIT = 20
RETRY_CODES = {429, 500, 503}


@lru_cache
def _client() -> genai.Client:
    if not config.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY가 설정되지 않았습니다.")
    return genai.Client(api_key=config.GEMINI_API_KEY)


def _generate(**kwargs):
    """기본 모델은 1번 재시도, 예비 모델은 쉬지 않고 1번씩 시도한다."""
    primary = kwargs.pop("model")
    plan = [(primary, 2)] + [(m, 1) for m in config.GEMINI_FALLBACK_MODELS]
    last_error = None
    for model, tries in plan:
        for attempt in range(tries):
            try:
                return _client().models.generate_content(model=model, **kwargs)
            except errors.APIError as e:
                last_error = e
                if e.code not in RETRY_CODES:
                    break  # 404 등 이 모델은 못 쓰는 경우 → 바로 다음 모델로
                if attempt < tries - 1:
                    time.sleep(2)
    raise last_error


def detect_topics(message: str) -> List[str]:
    """메시지에서 버튼 주제(운동/주스/흐름)를 언급했는지 찾는다."""
    return [t for t, words in TOPIC_KEYWORDS.items() if any(w in message for w in words)]


def build_system_prompt(summary_text: str, mode: Optional[str] = None, topics: Optional[List[str]] = None) -> str:
    if mode in MODE_TASKS:
        task = MODE_TASKS[mode]
    else:
        hint = ""
        if topics:
            names = ", ".join(f"'{TOPIC_BUTTON[t]}'" for t in topics)
            hint = f"\n- 이번 메시지는 {names} 주제를 언급했어. 자세한 내용 대신 그 버튼을 눌러 달라고 꼭 권해."
        task = FREE_TASK.format(hint=hint)
    return BASE_TEMPLATE.format(today=today_kst(), summary=summary_text, task=task)


def _to_content(role: str, text: str) -> types.Content:
    # Gemini는 assistant 대신 "model"이라는 역할 이름을 쓴다
    return types.Content(
        role="model" if role == "assistant" else "user",
        parts=[types.Part(text=text)],
    )


def chat(summary_text: str, history: List[dict], user_message: str, mode: Optional[str] = None) -> str:
    topics = [] if mode else detect_topics(user_message)
    contents = [_to_content(m["role"], m["content"]) for m in history[-HISTORY_LIMIT:]]
    contents.append(_to_content("user", user_message))

    res = _generate(
        model=config.GEMINI_MODEL,
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=build_system_prompt(summary_text, mode, topics),
            temperature=0.7,
        ),
    )
    reply = (res.text or "").strip()

    # AI가 버튼 안내를 빠뜨렸으면 직접 덧붙인다
    missing = [t for t in topics if TOPIC_BUTTON[t] not in reply]
    if missing:
        names = ", ".join(f"'{TOPIC_BUTTON[t]}'" for t in missing)
        reply += f"\n\n아래 {names} 버튼을 누르면 오늘 기록에 맞춰서 자세히 알려줄게냥!"
    return reply


def _parse_songs(text: Optional[str]) -> List[dict]:
    """Gemini가 객체, 배열, ```json 코드블록 등 어떤 형태로 줘도 곡 목록을 꺼낸다."""
    if not text:
        return []
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
    data = json.loads(text)
    songs = data.get("songs", []) if isinstance(data, dict) else data
    if not isinstance(songs, list):
        return []
    out = []
    for s in songs:
        if isinstance(s, dict) and s.get("title"):
            out.append({
                "title": str(s.get("title", "")).strip(),
                "artist": str(s.get("artist", "")).strip(),
                "reason": str(s.get("reason", "")).strip(),
            })
    return out[:5]


def generate_playlist(entry: dict) -> List[dict]:
    prompt = (
        f"오늘 사용자는 스트레스 {entry.get('stress')}/10, 컨디션 {entry.get('value')}/10, "
        f"수면 {entry.get('sleep_hours')}시간이고 메모는 '{entry.get('memo') or '없음'}'이야.\n"
        "긴장을 풀고 기분을 전환할 수 있는 실제로 존재하는 유명한 곡 5개를 추천해. "
        "한국 곡과 해외 곡을 섞어 줘. 가사는 쓰지 마.\n"
        '{"songs": [{"title": "곡명", "artist": "아티스트", "reason": "추천 이유 한 문장"}]} 형식으로 답해.'
    )
    res = _generate(
        model=config.GEMINI_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",  # JSON만 돌려받기
            temperature=0.8,
        ),
    )
    return _parse_songs(res.text)
