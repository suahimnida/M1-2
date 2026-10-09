# 껌냥이 트레이너 🐈‍⬛

매일의 컨디션 기록을 분석해서, 내 상황을 아는 검은 고양이 AI 트레이너가 오늘에 맞는 운동과 건강 주스를 추천해 주는 웹 서비스입니다.

## 서비스 소개

운동 앱의 추천은 대부분 "오늘 내 상태"를 모릅니다. 잠을 4시간 잔 날에도, 마감에 시달린 날에도 똑같은 루틴을 권하죠. 껌냥이 트레이너는 매일 기록한 컨디션·스트레스·수면 데이터를 요약해 AI의 시스템 프롬프트에 주입(컨텍스트 주입)하기 때문에, 기록을 근거로 한 맞춤 대화를 할 수 있습니다.

- **매일 컨디션 체크**: 날짜, 컨디션(1~10), 스트레스(1~10), 수면 시간, 오늘의 목적, 메모 기록
- **맞춤 운동 추천**: 컨디션이 낮거나 수면이 부족하면 회복 위주로, 좋으면 목적에 맞는 강도로
- **건강 주스 레시피 추천**: 최근 상태에 맞는 재료와 분량, 만드는 법
- **스트레스 많은 날 음악 자동 저장**: 스트레스 7 이상으로 기록하면 기분 전환 곡 5개를 자동 저장
- **대화 기록**: 모든 대화가 자동 저장되고, 이전 대화를 불러와 이어서 대화 가능
- **껌냥이 표정**: 최근 컨디션에 따라 눈 모양이 바뀌고, 스트레스가 높으면 땀방울이 맺힘

## 기술 스택

| 구분 | 사용 기술 |
|---|---|
| 백엔드 | Python 3.11, FastAPI, Pydantic v2, Uvicorn |
| 데이터베이스 | Firebase Firestore (firebase-admin) |
| AI | OpenAI Chat Completions API (gpt-4o-mini) |
| 프론트엔드 | HTML, CSS, JavaScript (프레임워크 없음) |
| 배포 | Render (백엔드), Vercel (프론트엔드) |

## 배포 URL

- 프론트엔드: https://YOUR-PROJECT.vercel.app
- 백엔드 API: https://YOUR-SERVICE.onrender.com
- Swagger UI: https://YOUR-SERVICE.onrender.com/docs

> Render 무료 티어는 15분 동안 요청이 없으면 서버가 잠듭니다. 첫 접속 시 프론트엔드가 `/health`로 서버를 깨우고, 2.5초 이상 걸리면 "서버를 깨우는 중" 안내 배너를 띄운 뒤 자동으로 재시도합니다.

## 프로젝트 구조

```
backend/
├── main.py                 # 앱 초기화, CORS, 라우터 등록
├── core/                   # 환경변수, Firestore 연결, 공통 유틸
├── schemas/                # Pydantic 요청/응답 모델 (검증)
├── routers/                # data, conversations, chat, playlists
├── services/               # DB 처리, 요약 분석, OpenAI 호출
├── scripts/                # 샘플 데이터 생성, Firestore 업로드
└── sample_data/            # 생성된 샘플 데이터 (127일치)
frontend/
├── src/                    # index.html, style.css, app.js, config.js
├── build.js                # Vercel 빌드 시 API_URL로 config.js 생성
└── vercel.json
```

## 데이터

### 컬렉션 구조

| 컬렉션 | 용도 | 주요 필드 |
|---|---|---|
| `data` | 컨디션 기록 | date, value(컨디션), memo, stress, sleep_hours, goal |
| `conversations` | 대화 기록 | title, messages[{role, content, timestamp}] |
| `playlists` | 스트레스 날 음악 | date, stress, data_id, songs[{title, artist, reason}] |

### 샘플 데이터

`scripts/generate_sample_data.py`로 2026-06-01 ~ 2026-10-05의 127일치 데이터를 생성했습니다. 주말엔 수면이 늘고 스트레스가 줄며, 마감 주간(7월 말, 9월 말)엔 수면 감소와 스트레스 급증이 나타나고, 운동 습관이 붙으면서 컨디션이 서서히 오르는 패턴을 넣었습니다.

### 요약 정보 (`GET /api/data/summary`)

기간, 기록 수, 컨디션 평균·최고·최저, 최근 7일 평균과 직전 7일 대비 추세(증가/감소/유지), 평균 스트레스와 추세, 최근 30일 고스트레스 일수, 평균 수면, 수면 6시간 미만/7시간 이상일 때의 컨디션 비교, 요일별 컨디션, 최근 7일 상세 기록을 계산합니다. 이 내용을 텍스트로 정리한 `text` 필드가 시스템 프롬프트에 그대로 들어갑니다.

## API

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/data` | 컨디션 기록 추가 (같은 날짜 중복 시 409) |
| GET | `/api/data` | 기록 목록 (최신순) |
| PUT | `/api/data/{id}` | 기록 수정 (보낸 필드만 반영) |
| DELETE | `/api/data/{id}` | 기록 삭제 |
| GET | `/api/data/summary` | 데이터 요약 (프롬프트 주입용) |
| POST | `/api/conversations` | 대화 저장 |
| GET | `/api/conversations` | 대화 목록 (messages 미포함, 개수·미리보기만) |
| GET | `/api/conversations/{id}` | 특정 대화의 전체 messages 조회 (방식 A) |
| DELETE | `/api/conversations/{id}` | 대화 삭제 |
| POST | `/api/chat` | AI 대화 (요약 조회 → 시스템 프롬프트 주입 → GPT 호출 → 자동 저장) |
| GET | `/api/playlists` | 자동 저장된 음악 목록 |
| DELETE | `/api/playlists/{id}` | 음악 목록 삭제 |
| GET | `/health` | 상태 확인 / 서버 깨우기 |

## 로컬 실행 방법

### 1. 사전 준비

1. Firebase 콘솔에서 프로젝트를 만들고 Firestore Database를 생성합니다.
2. 프로젝트 설정 > 서비스 계정 > 새 비공개 키 생성으로 JSON 키를 받아 `backend/serviceAccountKey.json`으로 저장합니다. (이 파일은 `.gitignore`에 포함되어 있습니다)
3. OpenAI API 키를 준비합니다.

### 2. 백엔드

```bash
cd backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env              # 값 채우기

python scripts/generate_sample_data.py      # 샘플 데이터 생성 (이미 포함되어 있음)
python scripts/upload_sample_data.py        # Firestore에 업로드

uvicorn main:app --reload
```

http://localhost:8000/docs 에서 Swagger UI를 확인할 수 있습니다.

### 3. 프론트엔드

```bash
cd frontend/src
python -m http.server 5500
```

http://localhost:5500 으로 접속합니다. 로컬에서는 `src/config.js`의 `http://localhost:8000`을 API 주소로 씁니다. VS Code Live Server를 써도 됩니다.

## 환경 변수

### 백엔드 (Render)

| 이름 | 필수 | 설명 |
|---|---|---|
| `OPENAI_API_KEY` | O | OpenAI API 키 |
| `FIREBASE_CREDENTIALS` | O (배포) | 서비스 계정 키 JSON 전체를 한 줄 문자열로 |
| `FIREBASE_CREDENTIALS_PATH` | O (로컬) | 서비스 계정 키 파일 경로 |
| `CORS_ORIGINS` | O | 허용할 프론트 주소, 쉼표로 구분 (예: `https://your-project.vercel.app`) |
| `OPENAI_MODEL` | | 기본값 `gpt-4o-mini` |
| `STRESS_THRESHOLD` | | 음악 자동 저장 기준, 기본값 `7` |

### 프론트엔드 (Vercel)

| 이름 | 필수 | 설명 |
|---|---|---|
| `API_URL` | O | 백엔드 주소 (예: `https://your-service.onrender.com`) |

## 배포 방법

### 백엔드 (Render)

1. GitHub에 저장소를 푸시합니다.
2. Render > New > Web Service에서 저장소를 연결하고 **Root Directory를 `backend`** 로 지정합니다.
3. Build Command `pip install -r requirements.txt`, Start Command `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Environment에 위 환경 변수를 추가합니다. `FIREBASE_CREDENTIALS`에는 키 JSON 파일 내용 전체를 붙여넣습니다.
5. 배포 후 `/docs`가 열리는지 확인합니다.

### 프론트엔드 (Vercel)

1. Vercel > Add New Project에서 같은 저장소를 가져오고 **Root Directory를 `frontend`** 로 지정합니다.
2. Environment Variables에 `API_URL`을 추가합니다.
3. 배포하면 `vercel.json` 설정에 따라 `node build.js`가 실행되어 `public/config.js`에 API 주소가 들어갑니다.
4. 배포된 프론트 주소를 Render의 `CORS_ORIGINS`에 추가하고 백엔드를 재배포합니다.

## 스크린샷

### 데이터 요약이 보이는 채팅 화면
![채팅 화면](docs/screenshot-chat.png)

### 데이터 관리 화면 (기록 추가/수정)
![데이터 관리](docs/screenshot-data.png)

### 대화 기록 화면 (불러오기)
![대화 기록](docs/screenshot-history.png)
+




