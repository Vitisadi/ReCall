# video.py
# Requirements: pip install openai-whisper face_recognition opencv-python numpy
# Also ensure ffmpeg is on PATH (e.g., choco install -y ffmpeg)

import os
import sys
import math
import shutil
from pathlib import Path

import cv2
import numpy as np
import whisper
import face_recognition


# --------------------------- config ---------------------------

# Choose a model: "small" or "base" is recommended on CPU; use "large" if you have a strong GPU
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "small")
LANG = "en"  # ISO code

# Video file name in the same folder as this script
VIDEO_NAME = "./videos/shimu_tim.MP4"

# How often to sample frames for face detection
SAMPLE_INTERVAL_SEC = 5

# Face match threshold (lower = stricter). Typical 0.45–0.60
FACE_MATCH_THRESHOLD = 0.55

# Extra margin around detected face box (percentage of box size)
CROP_MARGIN = 0.30

# Minimum face size; if smaller, upscale for nicer thumbnails
MIN_FACE_SIDE_FOR_NO_UPSCALE = 200
UPSCALE_FACTOR = 2.0

# JPEG quality for saved crops
JPEG_QUALITY = 95


# --------------------------- helpers ---------------------------

def ensure_ffmpeg():
    if shutil.which("ffmpeg") is None:
        sys.exit(
            "FFmpeg not found on PATH.\n"
            "Install it (e.g., `choco install -y ffmpeg`) then reopen PowerShell and run again."
        )


def pad_box(top, right, bottom, left, frame_w, frame_h, margin=0.30):
    h = bottom - top
    w = right - left
    top    = max(0, int(top    - margin * h))
    bottom = min(frame_h, int(bottom + margin * h))
    left   = max(0, int(left   - margin * w))
    right  = min(frame_w, int(right  + margin * w))
    return top, right, bottom, left


def sharpness_score(img_bgr: np.ndarray) -> float:
    # Variance of Laplacian: higher = sharper
    return cv2.Laplacian(cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var()


# --------------------------- main ---------------------------

def main():
    ensure_ffmpeg()

    script_dir = Path(__file__).resolve().parent
    video_path = script_dir / VIDEO_NAME
    if not video_path.exists():
        sys.exit(f"Video not found: {video_path}")

    output_dir = script_dir / "faces_unique"
    output_dir.mkdir(parents=True, exist_ok=True)

    # === Step 1: Load Whisper and transcribe ===
    print("Loading Whisper model...")
    model = whisper.load_model(WHISPER_MODEL)
    print(f"Transcribing {video_path.name}...")
    # fp16=False keeps it CPU-safe; set to True if you have a compatible GPU
    result = model.transcribe(str(video_path), language=LANG, fp16=False)

    # === Step 2: Process video and save best face per person ===
    video = cv2.VideoCapture(str(video_path))
    fps = int(video.get(cv2.CAP_PROP_FPS)) or 0
    if fps <= 0:
        sys.exit(f"Could not read FPS from video: {video_path}")

    sample_every = max(1, int(fps * SAMPLE_INTERVAL_SEC))

    persons = []  # [{ "encoding": np.ndarray, "best_score": float, "best_img": np.ndarray, "best_ts": float }]
    frame_num = 0

    print("\nAnalyzing faces in video...")
    while True:
        ret, frame = video.read()
        if not ret:
            break

        if frame_num % sample_every == 0:
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

            # upsample helps with small faces; HOG is CPU-friendly
            locations = face_recognition.face_locations(
                rgb, number_of_times_to_upsample=1, model="hog"
            )
            encodings = face_recognition.face_encodings(rgb, locations)

            h, w = frame.shape[:2]
            ts = frame_num / fps

            for enc, (top, right, bottom, left) in zip(encodings, locations):
                # Match to existing persons by distance
                if persons:
                    dists = face_recognition.face_distance([p["encoding"] for p in persons], enc)
                    j = int(np.argmin(dists))
                    min_dist = float(dists[j])
                else:
                    j, min_dist = -1, math.inf

                if min_dist < FACE_MATCH_THRESHOLD:
                    idx = j
                else:
                    persons.append({"encoding": enc, "best_score": -1, "best_img": None, "best_ts": None})
                    idx = len(persons) - 1

                t, r, b, l = pad_box(top, right, bottom, left, w, h, margin=CROP_MARGIN)
                if b <= t or r <= l:
                    continue

                crop = frame[t:b, l:r]
                score = sharpness_score(crop)

                if score > persons[idx]["best_score"]:
                    persons[idx]["best_score"] = score
                    persons[idx]["best_img"] = crop
                    persons[idx]["best_ts"] = ts

        frame_num += 1

    video.release()

    # Save best crops
    unique_faces = []
    for i, p in enumerate(persons, start=1):
        if p["best_img"] is None:
            continue
        img = p["best_img"]

        # Gentle upscale if the face is tiny
        if min(img.shape[:2]) < MIN_FACE_SIDE_FOR_NO_UPSCALE:
            img = cv2.resize(
                img, None, fx=UPSCALE_FACTOR, fy=UPSCALE_FACTOR, interpolation=cv2.INTER_LANCZOS4
            )

        filename = f"person_{i}.jpg"
        save_path = output_dir / filename
        cv2.imwrite(str(save_path), img, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
        unique_faces.append((p["best_ts"], str(save_path)))
        print(f"🧍 Best frame at {p['best_ts']:.2f}s → saved {filename}")

    # === Step 3: Save transcription ===
    transcript_path = video_path.with_name(video_path.stem + "_transcript.txt")
    with open(transcript_path, "w", encoding="utf-8") as f:
        f.write("=== Transcript ===\n\n")
        for seg in result.get("segments", []):
            f.write(f"[{seg['start']:.2f}s–{seg['end']:.2f}s] {seg['text'].strip()}\n")

    print(f"\n✅ Transcript saved to: {transcript_path}")
    print(f"✅ Saved {len(unique_faces)} unique face(s) in: {output_dir}")


if __name__ == "__main__":
    main()
