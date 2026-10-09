"""껌냥이 트레이너 API."""
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from core import config
from routers import chat, conversations, data, playlists

logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="껌냥이 트레이너 API",
    description="매일의 컨디션 기록을 분석해 맞춤 운동·주스를 추천하는 AI 트레이너",
    version="1.0.0",
)

logger = logging.getLogger("ggeomnyang")


# 처리 못 한 에러도 JSON 응답으로 바꾼다.
# CORS 미들웨어보다 먼저 등록해야 안쪽에 위치해서, 500 응답에도 CORS 헤더가 붙는다.
# (그렇지 않으면 서버 에러가 브라우저에서 'CORS policy' 에러로 잘못 보인다)
@app.middleware("http")
async def catch_errors(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception as exc:
        logger.exception("처리 중 에러: %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content={"detail": f"서버 에러: {type(exc).__name__}: {exc}"})


app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials="*" not in config.CORS_ORIGINS,  # "*"와 credentials는 같이 쓸 수 없다
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(data.router)
app.include_router(conversations.router)
app.include_router(chat.router)
app.include_router(playlists.router)


@app.exception_handler(RuntimeError)
async def config_error_handler(_: Request, exc: RuntimeError):
    """키 누락 같은 설정 오류를 500 대신 알아보기 쉬운 메시지로."""
    return JSONResponse(status_code=503, content={"detail": str(exc)})


@app.get("/", tags=["상태"])
def root():
    return {"service": "껌냥이 트레이너 API", "docs": "/docs"}


@app.get("/health", tags=["상태"], summary="서버 깨우기·상태 확인용")
def health():
    return {"status": "ok"}
