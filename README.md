# Memory Orbit Command Center

This repository contains a cross-platform React Native (Expo) app paired with a Python/Flask backend that turns raw conversations into searchable “memories.” The system ingests videos, extracts faces and transcripts, enriches each contact with metadata (LinkedIn, highlights, etc.), and exposes the results through a mobile-friendly command center.

> **Top-level features**
>
> - **Orbit Command Center (Home)** – snapshot of the entire memory graph, quick actions, and highlights preview.
> - **Memory tab** – list of everyone you’ve talked to, individual timelines, and a conversational AI for person-specific questions.
> - **Highlights** – upcoming reminders/events detected from transcripts with quick complete/dismiss actions.
> - **Upload flow** – capture or import new videos, run face + transcript analysis, and enroll new contacts automatically.

## Tech Stack

| Layer       | Technologies                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------- |
| Frontend    | React Native (Expo), React 19, `expo-linear-gradient`, Safe Area Context, Axios                               |
| Backend     | Python 3.10+, Flask, `insightface`, `opencv-python`, `moviepy`, `face_recognition`, Google Speech/Gemini APIs |
| Storage     | Local `backend/conversations/*.json` for transcripts & highlights, `backend/faces_db/` for enrolled faces     |
| Cloud APIs  | Google Gemini (highlights + summaries), Google Speech-to-Text, AWS (S3 credentials for asset access)          |

## Repository Layout

```
├── backend/
│   ├── app.py                 # Flask API entry point
│   ├── requirements.txt       # Backend Python deps
│   ├── analyzers/             # Video/face/transcript analyzers
│   ├── conversations/         # Per-person JSON memories
│   ├── faces_db/              # Enrolled face crops
│   └── services/              # Highlight + enrichment helpers
├── frontend/
│   ├── App.js                 # Expo root
│   ├── config.js              # BASE_URL for API calls
│   └── screens/               # Home, People, Upload, Highlights, Conversation
├── LICENSE
└── README.md
```

## Prerequisites

- **Node.js 18+** and npm/yarn for Expo.
- **Python 3.10+** (`python3 --version`) with `pip`.
- **Expo CLI** (`npm i -g expo-cli`) for local/device testing.
- **FFmpeg** installed and available on `$PATH` for video preprocessing (required by `moviepy`).
- Cloud credentials:
  - `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (used for file storage in the current pipeline).
  - `GEMINI_API_KEY` for Google Gemini summarization/highlights.
  - `BASE_URL` set to whatever host/port the backend runs on (defaults to `http://localhost:3000` for local dev).

## Backend Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env           # create your env, then fill in keys
python app.py                  # starts Flask on port 3000
```

`backend/.env` should define at least:

```env
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
GEMINI_API_KEY=...
BASE_URL=http://localhost:3000
```

### Key API Routes

| Method | Route                               | Description                                       |
| ------ | ----------------------------------- | ------------------------------------------------- |
| GET    | `/api/people`                       | List enrolled contacts + avatars/headlines        |
| GET    | `/api/conversation/<name>`          | Retrieve full transcript history for a person     |
| POST   | `/api/people/assistant`             | Ask AI questions scoped to a specific person      |
| POST   | `/api/process`                      | Upload a video (form-data) for analysis           |
| GET    | `/api/highlights`                   | Upcoming highlights (birthdays, follow-ups, etc.) |
| PATCH  | `/api/highlights/<highlight_id>`    | Complete/dismiss a highlight                      |

## Frontend Setup

```bash
cd frontend
npm install
cp config.example.js config.js   # ensure BASE_URL points to backend
npm run start                    # expo start
```

Open the Expo QR code in the Expo Go app (iOS/Android) or press `i`/`a` in the CLI to launch the simulator.

## Typical Workflow

1. **Enroll Faces / Upload Video** – use the Upload tab to add new footage. Backend detects faces & transcripts, then stores JSON in `backend/conversations/<name>.json`.
2. **Review Orbit** – Home > “Orbit Radar” shows the constellation of everyone you’ve talked to. Tap any face to jump straight into the memory view.
3. **Highlights** – Home preview or Highlights tab surfaces upcoming birthdays/events extracted from transcripts. Complete or dismiss them with a tap.
4. **Person Memory** – The Memory tab or highlights/orbit deep links open `ConversationScreen`, showing their avatar, timeline, and a person-specific “Ask AI” modal (scoped to that individual).

## Useful Commands

| Task                        | Command(s)                                      |
| --------------------------- | ---------------------------------------------- |
| Install backend deps        | `pip install -r backend/requirements.txt`       |
| Run Flask API               | `python backend/app.py`                         |
| Install frontend deps       | `cd frontend && npm install`                    |
| Start Expo                  | `cd frontend && npm run start`                  |
| iOS simulator               | (after `expo start`) press `i`                  |
| Android emulator            | (after `expo start`) press `a`                  |

## Notes & Troubleshooting

- **Orbit nodes off-screen?** Make sure your BASE_URL returns the same width/height data—node placement adapts to device width, so Expo reload helps when switching devices.
- **Highlights missing avatars?** `/api/people` must be reachable so the Highlights screen can preload images; otherwise it falls back to initials.
- **Large uploads** – `moviepy` and `insightface` can be heavy; ensure your backend machine has enough CPU and disk space.

## License

This project is licensed under the MIT License – see the [LICENSE](LICENSE) file for details.
