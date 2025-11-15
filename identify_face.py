# identify_face.py
import argparse, json, os, sys, math
from pathlib import Path
import numpy as np
import cv2
import face_recognition

DB_ROOT = Path(__file__).resolve().parent / "faces_db"
PEOPLE_DIR = DB_ROOT / "people"
INDEX_PATH = DB_ROOT / "people_index.json"

FACE_MATCH_THRESHOLD = 0.1   # lower = stricter; tune to 0.50–0.60
UPSAMPLE = 1                  # detection upsample

def load_all_embeddings():
    """Returns list of dicts: [{person_id, display_name, emb_path, vector}, ...]"""
    results = []
    if not PEOPLE_DIR.exists():
        return results
    for pdir in PEOPLE_DIR.iterdir():
        if not pdir.is_dir():
            continue
        meta_path = pdir / "meta.json"
        if not meta_path.exists():
            continue
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        name = meta.get("display_name", pdir.name)
        faces = meta.get("faces", [])
        for f in faces:
            npy_rel = f.get("embedding")
            if not npy_rel:
                continue
            npy_path = pdir / npy_rel
            if not npy_path.exists():
                continue
            vec = np.load(npy_path)
            results.append({
                "person_id": meta.get("person_id", pdir.name),
                "display_name": name,
                "emb_path": str(npy_path),
                "vector": vec.astype(np.float32)
            })
    return results

def pick_largest_face(locs):
    best = None
    best_area = -1
    for (t, r, b, l) in locs:
        area = (b - t) * (r - l)
        if area > best_area:
            best_area = area
            best = (t, r, b, l)
    return best

def cosine_distance(a: np.ndarray, b: np.ndarray) -> float:
    # distance = 1 - cosine_similarity
    a = a / (np.linalg.norm(a) + 1e-8)
    b = b / (np.linalg.norm(b) + 1e-8)
    return float(1.0 - np.dot(a, b))

def group_by_person(best_k):
    groups = {}
    for item in best_k:
        pid = item["person_id"]
        groups.setdefault(pid, []).append(item)
    agg = []
    for pid, arr in groups.items():
        name = arr[0]["display_name"]
        # aggregate by min distance for robustness
        d = min(x["distance"] for x in arr)
        agg.append({"person_id": pid, "display_name": name, "distance": d})
    # sort ascending by distance
    agg.sort(key=lambda x: x["distance"])
    return agg

def main():
    parser = argparse.ArgumentParser(description="Identify a face from local registry.")
    parser.add_argument("--image", required=True, help="Path to image to identify")
    parser.add_argument("--topk", type=int, default=3, help="Show top-K candidates")
    args = parser.parse_args()

    img_path = Path(args.image).resolve()
    if not img_path.exists():
        sys.exit(f"Image not found: {img_path}")

    # Load query image
    bgr = cv2.imread(str(img_path))
    if bgr is None:
        sys.exit("Failed to read image with OpenCV.")
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)

    locs = face_recognition.face_locations(rgb, number_of_times_to_upsample=UPSAMPLE, model="hog")
    if not locs:
        sys.exit("No face detected in the query image.")
    t, r, b, l = pick_largest_face(locs)

    encs = face_recognition.face_encodings(rgb, [(t, r, b, l)])
    if not encs:
        sys.exit("Failed to compute face encoding for the query image.")
    q = encs[0].astype(np.float32)

    # Load DB
    entries = load_all_embeddings()
    if not entries:
        sys.exit("No enrolled faces found. Enroll someone first with enroll_face.py.")

    # Compute distances to all stored embeddings
    scored = []
    for e in entries:
        # Using cosine distance; you could also use Euclidean
        d = cosine_distance(q, e["vector"])
        scored.append({**e, "distance": d})

    # Sort by distance
    scored.sort(key=lambda x: x["distance"])
    # Aggregate by person (min distance)
    agg = group_by_person(scored[:max(args.topk * 5, 20)])  # consider a wider pool then show topK

    # Result
    best = agg[0]
    is_known = best["distance"] < FACE_MATCH_THRESHOLD

    if is_known:
        print(f"✅ Match: {best['display_name']} (person_id={best['person_id']})")
        print(f"   distance={best['distance']:.3f}  threshold<{FACE_MATCH_THRESHOLD}")
    else:
        print("🤷 Unknown face (no match under threshold).")
        print(f"Best candidate: {best['display_name']}  distance={best['distance']:.3f}  threshold<{FACE_MATCH_THRESHOLD}")

    # Show top-K
    print("\nTop candidates:")
    for item in agg[:args.topk]:
        print(f"  - {item['display_name']} (person_id={item['person_id']})  distance={item['distance']:.3f}")

if __name__ == "__main__":
    main()
