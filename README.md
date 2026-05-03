# Mentora

**Mentora** is a personalized study assistant for students. It combines academic planning, Pomodoro-style focus sessions, emotional awareness, personality profiling (TIPI / OCEAN), and social features so learners can study more sustainably—not only harder.

---

## Links

| Resource | URL |
|----------|-----|
| **GitHub repository** | [https://github.com/alperbiceral/Mentora](https://github.com/alperbiceral/Mentora) |
| **Project website (portfolio)** | [https://alperbiceral.github.io/Mentora/](https://alperbiceral.github.io/Mentora/) |

The static site in [`docs/`](docs/) is intended for [GitHub Pages](https://pages.github.com/) (source: branch `main`, folder `/docs`). If Pages is enabled on the repo above, the portfolio URL is typically `https://<owner>.github.io/<repo>/`.

**Course reports** (also linked from the portfolio):

- [CS 491 — Project Specifications Report](https://drive.google.com/file/d/1C3tL5vSksBOuIG8FxWSRjYdfMWWT3y90/view?usp=sharing)
- [CS 491 — Analysis and Requirements Report](https://drive.google.com/file/d/1R7tw0fnixNfc3snIHHrTv3HE2GsynM45/view?usp=sharing)
- [CS 492 — Detailed Design Report](https://drive.google.com/file/d/1stt_R8ZwhIrV5A_orYUuhJuyNCDsft4a/view?usp=sharing)

---

## Team

| Name | Student ID |
|------|------------|
| Berfin Örtülü | 21802704 |
| Gülferiz Bayar | 21901442 |
| Alper Biçer | 22003097 |
| Kerem Demirören | 22203380 |
| Farabi Sina Sari | 22102084 |

Team profiles and assets live on the [portfolio site](https://alperbiceral.github.io/Mentora/).

---

## What Mentora does

Students often struggle with irregular sleep, low motivation, inconsistent habits, and stress. Mentora addresses this by:

- **Planning** — Weekly study plans that weigh course workload, priorities, deadlines, and available time (see [`ALGO.md`](ALGO.md) for scheduling principles).
- **Execution** — Pomodoro-style timers, study sessions, and progress tracking.
- **Well-being** — Emotion signals (e.g. from facial expression analysis and text), breathing/physical break prompts, and adaptive support.
- **Self-knowledge** — TIPI-style questionnaires and OCEAN (Five-Factor) traits to tailor suggestions (e.g. focus length, breaks, group study hints).
- **Academic context** — Courses, exams, assignments, and uploaded materials inform difficulty and notifications; weekly feedback (“How was your week?”, goals, improvements) can feed back into planning.

The product vision is summarized on the website under *Planning*, *Execution*, and *Support & Engagement*.

### Mentora nasıl çalışır?

Öğrenci uygulamaya kayıt olup giriş yaptıktan sonra profilini, derslerini, sınav ve ödev tarihlerini ve mümkünse transkript veya ders materyali gibi belgeleri sisteme tanıtır; ayrıca kişilik envanterini (OCEAN / TIPI tarzı sorular) tamamlar ve isteğe bağlı olarak yüz ifadesi veya metin tabanlı geri bildirimle duygu durumunu iletir. Bu bilgiler FastAPI arka ucunda PostgreSQL veritabanında tutulur; planlama modülü öncelik sırasını **deadline’lar → müsaitlik → kişilik → duygu** ekseninde uygular ([`ALGO.md`](ALGO.md)). Duygu skorları günlük enerji ve oturum önerilerini etkiler; kişilik özellikleri (ör. özdisiplin, nevrotiklik, açıklık) odak süresi, mola uzunluğu, günde kaç oturum ve hatta çalışma grubu önerisi gibi parametreleri şekillendirir. Yaklaşan sınav veya büyük teslimler için bildirimler üretilir, haftalık iş yükü arttıkça plan daha erken başlamayı veya süreleri yeniden dengelemeyi hedefler.

Uygulama tarafında öğrenci haftalık programa ve günlük oturumlara göre Pomodoro tarzı çalışma bloklarına girer; oturumlar kayıt altına alınır, mola anlarında nefes veya hafif egzersiz gibi destekler sunulabilir. Arkadaşlar, gruplar ve WebSocket ile çalışan sohbet sosyal motivasyonu destekler; günlük sorular ve Google Gemini tabanlı yapay zekâ asistanı (`/ai-assistant`) açıklama ve yönlendirme sağlar. Hafta sonunda “nasıl geçti, hedeflere ulaşıldı mı, ne iyileşebilir?” gibi kısa geri bildirimler toplanıp tekrar analiz ve yeniden planlamaya girdi olur; böylece sistem tek seferlik bir takvim değil, öğrencinin gerçek performansına göre güncellenen bir döngü halinde çalışır.

---

## Repository layout

```
Mentora/
├── docs/                 # GitHub Pages portfolio (HTML/CSS/JS)
├── mentora/
│   ├── backend/          # FastAPI API, SQLAlchemy, PostgreSQL
│   └── frontend/         # Expo (React Native) app with expo-router
├── ALGO.md               # Scheduling & emotion formulas (design reference)
└── README.md
```

---

## Tech stack

### Backend (`mentora/backend/`)

- **Framework:** [FastAPI](https://fastapi.tiangolo.com/)
- **Database:** PostgreSQL via [SQLAlchemy](https://www.sqlalchemy.org/) 2.x
- **Auth:** JWT (`python-jose`), password hashing (`passlib` / `bcrypt`)
- **ML / NLP:** PyTorch, Hugging Face `transformers` (emotion-related flows)
- **AI assistant:** Google Gemini (`google-genai`, configured via env — see `.env.example`)

**Routers (API surface):**

| Prefix | Area |
|--------|------|
| `/auth` | Registration, login, JWT |
| `/profile` | User profile |
| `/courses` | Courses, uploads |
| `/friends`, `/groups`, `/chat` | Social & messaging (incl. WebSocket chat) |
| `/ocean` | Personality (OCEAN) flows |
| `/emotion` | Emotion capture / analysis |
| `/study-sessions` | Study session logging |
| `/daily-question` | Daily prompts |
| `/scheduler` | Scheduling logic |
| `/ai-assistant` | Gemini-backed assistant |
| `/notifications` | Notifications |

Root `GET /` returns a short welcome JSON for the Mentora API.

### Frontend (`mentora/frontend/`)

- **Expo SDK ~54**, **React Native**, **expo-router** (file-based routes)
- **TypeScript**, **React 19**
- Tabs and screens for home, study, schedule, chat, social, profile, auth, OCEAN questionnaire, emotion capture, AI agent, etc.
- API base URL: `EXPO_PUBLIC_API_URL` (defaults to `http://localhost:8000` in code if unset)

---

## Local development

### Prerequisites

- **Node.js** (for the Expo app)
- **Python 3.10+** (for the backend)
- **PostgreSQL** (connection string in `DATABASE_URL`)

### Backend

```bash
cd mentora/backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
```

Copy environment variables from `mentora/.env.example` into `mentora/.env` (or set them in your shell) and fill in `DATABASE_URL`, `JWT_SECRET_KEY`, and `GEMINI_API_KEY` as needed.

Run the API (example):

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Interactive docs: `http://localhost:8000/docs` (Swagger UI).

### Frontend

```bash
cd mentora/frontend
npm install
npx expo start
```

Point the app at your API by setting `EXPO_PUBLIC_API_URL` in `.env` or your Expo env (see `mentora/.env.example`).

### Portfolio / docs site

Open `docs/index.html` in a browser locally, or serve the `docs/` folder with any static server. Deploy via GitHub Pages using the steps in [`docs/readme`](docs/readme).

---

## Algorithm & design notes

High-level rules (deadlines, availability, personality, emotion) and formulas for **daily energy**, **weekly/daily study load**, and session parameters are documented in [`ALGO.md`](ALGO.md). The backend `scheduler` and related routers implement or consume this design.

---

## License / academic context

This project is developed as part of **CS 491 / CS 492** coursework; deliverables and reports are linked above and on the [portfolio](https://alperbiceral.github.io/Mentora/).

---

© 2026 Mentora Team
