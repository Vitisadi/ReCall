# enroll_face.py
import argparse, json, os, sys, uuid, hashlib, time
from pathlib import Path
import cv2
import numpy as np
import face_recognition

DB_ROOT = Path(__file__).resolve().parent / "faces_db"
PEOPLE_DIR = DB_ROOT / "people"
INDEX_PATH = DB_ROOT / "people_index.json"

CROP_MARGIN = 0.30          # 30% padding around box
MIN_FACE_SIDE_SAVE = 120    # skip microscopic faces
JPEG_QUALITY = 95

def ensure_db():
    PEOPLE_DIR.mkdir(parents=True, exist_ok=True)
    if not INDEX_PATH.exists():
        INDEX_PATH.write_text("{}", encoding="utf-8")

def load_index():
    ensure_db()
    return json.loads(INDEX_PATH.read_text(encoding="utf-8"))

def save_index(idx):
    INDEX_PATH.write_text(json.dumps(idx, indent=2), encoding="utf-8")

def norm_name(name: str) -> str:
    return " ".join(name.strip().lower().split())

def sharpness_score(img_bgr: np.ndarray) -> float:
    return cv2.Laplacian(cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var()

def pad_box(top, right, bottom, left, w, h, margin=0.30):
    hh = bottom - top
    ww = right - left
    top    = max(0, int(top    - margin * hh))
    bottom = min(h, int(bottom + margin * hh))
    left   = max(0, int(left   - margin * ww))
    right  = min(w, int(right  + margin * ww))
    return top, right, bottom, left

def pick_largest_face(locs):
    # choose face with largest area
    best = None
    best_area = -1
    for (t, r, b, l) in locs:
        area = (b - t) * (r - l)
        if area > best_area:
            best_area = area
            best = (t, r, b, l)
    return best

def ensure_person_dir(person_id: str, display_name: str):
    pdir = PEOPLE_DIR / person_id
    faces_dir = pdir / "faces"
    faces_dir.mkdir(parents=True, exist_ok=True)
    meta_path = pdir / "meta.json"
    if not meta_path.exists():
        meta = {
            "person_id": person_id,
            "display_name": display_name,
            "created_at": int(time.time()),
            "faces": []  # list of dicts
        }
        meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return pdir, faces_dir, meta_path

def load_meta(meta_path: Path):
    return json.loads(meta_path.read_text(encoding="utf-8"))

def save_meta(meta_path: Path, data: dict):
    meta_path.write_text(json.dumps(data, indent=2), encoding="utf-8")

def image_hash(img: np.ndarray) -> str:
    # Perceptual-ish quick hash: md5 of resized grayscale
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    g = cv2.resize(g, (64, 64), interpolation=cv2.INTER_AREA)
    return hashlib.md5(g.tobytes()).hexdigest()[:16]

def main():
    parser = argparse.ArgumentParser(description="Enroll a face with a name.")
    parser.add_argument("--image", required=True, help="Path to image")
    parser.add_argument("--name", required=True, help="Person's display name")
    args = parser.parse_args()

    img_path = Path(args.image).resolve()
    if not img_path.exists():
        sys.exit(f"Image not found: {img_path}")

    # Load image
    bgr = cv2.imread(str(img_path))
    if bgr is None:
        sys.exit("Failed to read image with OpenCV.")

    h, w = bgr.shape[:2]
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)

    # Detect faces (upsample helps small faces)
    locs = face_recognition.face_locations(rgb, number_of_times_to_upsample=1, model="hog")
    if not locs:
        sys.exit("No face detected in the image.")

    # Pick largest face
    top, right, bottom, left = pick_largest_face(locs)
    t, r, b, l = pad_box(top, right, bottom, left, w, h, margin=CROP_MARGIN)
    crop = bgr[t:b, l:r]
    if min(crop.shape[:2]) < MIN_FACE_SIDE_SAVE:
        print("Warning: face is quite small; consider a higher-res image.", file=sys.stderr)

    # Compute encoding from original RGB using the original box
    encodings = face_recognition.face_encodings(rgb, [(top, right, bottom, left)])
    if not encodings:
        sys.exit("Failed to compute face encoding.")
    emb = encodings[0].astype(np.float32)

    # Resolve or create person ID
    idx = load_index()
    key = norm_name(args.name)
    if key in idx:
        person_id = idx[key]
        created_new = False
    else:
        person_id = uuid.uuid4().hex
        idx[key] = person_id
        save_index(idx)
        created_new = True

    # Ensure person directory
    pdir, faces_dir, meta_path = ensure_person_dir(person_id, args.name if created_new else load_meta(meta_path)["display_name"])
    meta = load_meta(meta_path)

    # File names
    ts = int(time.time())
    hsh = image_hash(crop)
    jpg_name = f"{ts}_{hsh}.jpg"
    npy_name = f"{ts}_{hsh}.npy"

    # Save crop and embedding
    cv2.imwrite(str(faces_dir / jpg_name), crop, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
    np.save(faces_dir / npy_name, emb)

    # Update meta
    entry = {
        "face_id": f"{ts}_{hsh}",
        "img": f"faces/{jpg_name}",
        "embedding": f"faces/{npy_name}",
        "width": int(crop.shape[1]),
        "height": int(crop.shape[0]),
        "sharpness": float(sharpness_score(crop)),
        "captured_at": ts,
        "source": str(img_path.name)
    }
    meta["faces"].append(entry)
    save_meta(meta_path, meta)

    print(f"✅ Enrolled: {args.name} (person_id={person_id})")
    print(f"   Saved crop: {faces_dir / jpg_name}")
    print(f"   Saved embedding: {faces_dir / npy_name}")

if __name__ == "__main__":
    main()
