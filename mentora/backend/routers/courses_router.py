from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile, Form
from sqlalchemy.orm import Session
import re
from typing import Any
import os
import logging
import json

from config import GEMINI_API_KEY, GEMINI_MODEL
from deps import get_db
from models import Course, CourseBlock, Profile
from schemas import CourseCreate, CourseResponse, CourseUpdate
import google.generativeai as genai

router = APIRouter(prefix="/courses", tags=["courses"])

logger = logging.getLogger("mentora.ocr")
OCR_DEBUG = os.getenv("OCR_DEBUG", "0") == "1"


TIME_RANGE_RE = re.compile(
    r"(\d{1,2})\s*[:.]\s*(\d{2})\s*[-–]?\s*(\d{1,2})\s*[:.]\s*(\d{2})"
)
DAY_ALIASES = {
    "mon": "Mon",
    "monday": "Mon",
    "tue": "Tue",
    "tuesday": "Tue",
    "wed": "Wed",
    "wednesday": "Wed",
    "thu": "Thu",
    "thursday": "Thu",
    "fri": "Fri",
    "friday": "Fri",
    "sat": "Sat",
    "saturday": "Sat",
    "sun": "Sun",
    "sunday": "Sun",
}
COURSE_COLORS = [
    "#3B82F6",
    "#F59E0B",
    "#10B981",
    "#8B5CF6",
    "#EF4444",
    "#14B8A6",
    "#F97316",
]
WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
MERGE_GAP_MINUTES = 15
NOISE_TOKENS = {
    "face",
    "to",
    "lecture",
    "spare",
    "hour",
    "face-to-face",
    "face-to",
}


def _normalize_day(value: str | None) -> str | None:
    if not value:
        return None
    key = re.sub(r"[^a-zA-Z]", "", value).lower()
    if not key:
        return None
    return DAY_ALIASES.get(key)


def _normalize_time(value: str) -> str | None:
    if not value:
        return None
    cleaned = value.strip().replace(".", ":")
    match = re.match(r"^(\d{1,2}):(\d{2})$", cleaned)
    if not match:
        return None
    hour = int(match.group(1))
    minute = int(match.group(2))
    if hour < 0 or hour > 24 or minute < 0 or minute > 59:
        return None
    return f"{hour:02d}:{minute:02d}"


def _round_time_to_slot(value: str, slot_minutes: int, mode: str) -> str | None:
    normalized = _normalize_time(value)
    if not normalized:
        return None
    hour, minute = [int(part) for part in normalized.split(":")]
    if mode == "start":
        minute = (minute // slot_minutes) * slot_minutes
    else:
        minute = ((minute + slot_minutes - 1) // slot_minutes) * slot_minutes
    if minute >= 60:
        hour += 1
        minute = 0
    if hour > 24:
        hour = 24
        minute = 0
    return f"{hour:02d}:{minute:02d}"


def _extract_times(line_text: str) -> list[str]:
    matches = TIME_RANGE_RE.findall(line_text)
    if matches:
        times = []
        for match in matches:
            if len(match) == 4:
                times.append(f"{int(match[0]):02d}:{int(match[1]):02d}")
                times.append(f"{int(match[2]):02d}:{int(match[3]):02d}")
        return times

    loose = re.findall(r"(\d{1,2})\s*[:.]\s*(\d{2})", line_text)
    return [f"{int(h):02d}:{int(m):02d}" for h, m in loose]


def _normalize_course_code(value: str) -> str:
    cleaned = re.sub(r"\s+", " ", value.upper()).strip()
    cleaned = re.sub(r"\s*-\s*", "-", cleaned)
    return cleaned


def _extract_course_fields(text: str) -> tuple[str | None, str | None, str]:
    cleaned = re.sub(r"\s+", " ", text).strip()
    if not cleaned:
        return None, None, ""

    noise_removed = " ".join(
        token
        for token in cleaned.replace("-", " - ").split()
        if token.lower() not in NOISE_TOKENS
    ).replace(" - ", "-")

    code_candidates = re.findall(
        r"\b([A-Z]{1,4}\s*-?\s*\d{2,4}(?:-\d{3})?)\b",
        noise_removed,
    )
    course_code = None
    location = None

    for candidate in code_candidates:
        normalized = _normalize_course_code(candidate)
        if re.search(r"\d{3}-\d{3}$", normalized):
            course_code = normalized
            break

    if course_code is None and code_candidates:
        course_code = _normalize_course_code(code_candidates[0])

    for candidate in code_candidates:
        normalized = _normalize_course_code(candidate)
        if normalized == course_code:
            continue
        if re.search(r"\d{3}-\d{3}$", normalized):
            continue
        location = normalized
        break

    description = noise_removed
    if course_code:
        description = description.replace(course_match.group(0), "").strip()
    if location:
        description = description.replace(location, "").strip()
    return course_code, location, description


def _time_to_minutes(value: str) -> int:
    hour, minute = [int(part) for part in value.split(":")]
    return hour * 60 + minute


def _extract_json_payload(text: str) -> list[dict[str, Any]]:
    if not text:
        return []
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?", "", cleaned.strip(), flags=re.IGNORECASE)
        cleaned = re.sub(r"```$", "", cleaned.strip())
    try:
        payload = json.loads(cleaned)
        if isinstance(payload, list):
            return payload
    except json.JSONDecodeError:
        pass
    return []


def _normalize_day_value(value: str | None) -> str | None:
    if not value:
        return None
    normalized = _normalize_day(value)
    if normalized:
        return normalized
    return None


def _clean_blocks(blocks: list[dict[str, Any]]) -> list[dict[str, str]]:
    cleaned = []
    for block in blocks:
        day = _normalize_day_value(block.get("day"))
        start = _normalize_time(str(block.get("start", "")))
        end = _normalize_time(str(block.get("end", "")))
        if not day or not start or not end:
            continue
        # Align to 30-minute slots to match the schedule grid.
        start = _round_time_to_slot(start, 30, "start") or start
        end = _round_time_to_slot(end, 30, "end") or end
        if _time_to_minutes(start) >= _time_to_minutes(end):
            continue
        cleaned.append({"day": day, "start": start, "end": end})
    return cleaned


def _extract_header_day_columns(
    lines: list[dict[str, Any]],
) -> list[tuple[str, float]]:
    header_line = None
    for line in lines:
        text = line["text"].lower()
        if "hour" in text or any(day.lower() in text for day in WEEKDAYS):
            header_line = line
            break

    if not header_line:
        return []

    tokens = sorted(header_line["tokens"], key=lambda t: t["x_center"])
    day_columns: list[tuple[str, float]] = []
    missing = WEEKDAYS.copy()

    for token in tokens:
        token_text = str(token["text"]).lower()
        if "hour" in token_text:
            continue
        day_key = _normalize_day(token_text)
        if not day_key and "day" in token_text and missing:
            day_key = missing[0]
        if day_key and day_key in missing:
            day_columns.append((day_key, float(token["x_center"])))
            missing.remove(day_key)

    return day_columns


def _build_tokens(annotations: list[Any]) -> list[dict[str, float | str]]:
    tokens = []
    for ann in annotations:
        vertices = ann.bounding_poly.vertices
        xs = [v.x or 0 for v in vertices]
        ys = [v.y or 0 for v in vertices]
        x_min = min(xs)
        x_max = max(xs)
        y_min = min(ys)
        y_max = max(ys)
        tokens.append(
            {
                "text": ann.description,
                "x_min": x_min,
                "x_max": x_max,
                "y_min": y_min,
                "y_max": y_max,
                "x_center": (x_min + x_max) / 2,
                "y_center": (y_min + y_max) / 2,
            }
        )
    return tokens


def _cluster_lines(tokens: list[dict[str, float | str]]) -> list[dict[str, Any]]:
    if not tokens:
        return []
    tokens_sorted = sorted(tokens, key=lambda t: (t["y_center"], t["x_center"]))
    heights = [t["y_max"] - t["y_min"] for t in tokens_sorted]
    avg_height = max(1.0, sum(heights) / len(heights))
    threshold = avg_height * 0.6
    lines: list[dict[str, Any]] = []

    for token in tokens_sorted:
        if not lines or abs(token["y_center"] - lines[-1]["y_center"]) > threshold:
            lines.append({"tokens": [token], "y_center": token["y_center"]})
            continue
        lines[-1]["tokens"].append(token)
        lines[-1]["y_center"] = (
            sum(t["y_center"] for t in lines[-1]["tokens"]) / len(lines[-1]["tokens"])
        )

    results: list[dict[str, Any]] = []
    for line in lines:
        line_tokens = sorted(line["tokens"], key=lambda t: t["x_center"])
        text = " ".join(str(t["text"]) for t in line_tokens).strip()
        x_min = min(t["x_min"] for t in line_tokens)
        x_max = max(t["x_max"] for t in line_tokens)
        y_min = min(t["y_min"] for t in line_tokens)
        y_max = max(t["y_max"] for t in line_tokens)
        results.append(
            {
                "tokens": line_tokens,
                "text": text,
                "x_min": x_min,
                "x_max": x_max,
                "y_min": y_min,
                "y_max": y_max,
                "x_center": (x_min + x_max) / 2,
                "y_center": (y_min + y_max) / 2,
                "height": y_max - y_min,
            }
        )
    return results


def _infer_day_columns(
    tokens: list[dict[str, float | str]],
    time_lines: list[dict[str, Any]],
) -> list[tuple[str, float]]:
    if not tokens:
        return []

    time_column_max = 0.0
    if time_lines:
        time_column_max = max(line["x_max"] for line in time_lines if "x_max" in line)

    candidates = [
        t for t in tokens if t["x_center"] > time_column_max + 8
    ]
    if not candidates:
        return []

    x_centers = sorted(t["x_center"] for t in candidates)
    if len(x_centers) < 2:
        return []

    gaps = [b - a for a, b in zip(x_centers, x_centers[1:])]
    avg_gap = sum(gaps) / len(gaps)
    threshold = max(avg_gap * 1.8, 8)

    clusters: list[list[float]] = [[x_centers[0]]]
    for x in x_centers[1:]:
        if x - clusters[-1][-1] > threshold:
            clusters.append([x])
        else:
            clusters[-1].append(x)

    column_centers = [sum(cluster) / len(cluster) for cluster in clusters]
    column_centers = sorted(column_centers)
    if not column_centers:
        return []

    day_count = min(len(column_centers), len(WEEKDAYS))
    return list(zip(WEEKDAYS[:day_count], column_centers[:day_count]))


def _parse_schedule_tokens(tokens: list[dict[str, float | str]]) -> list[dict[str, Any]]:
    if not tokens:
        return []

    image_width = max(t["x_max"] for t in tokens)
    image_height = max(t["y_max"] for t in tokens)

    lines = _cluster_lines(tokens)
    if OCR_DEBUG:
        logger.info("OCR tokens: %s", len(tokens))
        logger.info("OCR lines: %s", len(lines))
        for line in lines[:12]:
            logger.info("LINE: %s", line["text"])
    time_lines = []
    for line in lines:
        times = _extract_times(line["text"])
        if len(times) >= 2 and line["x_max"] <= image_width * 0.6:
            start = _normalize_time(times[0])
            end = _normalize_time(times[1])
            if start and end:
                time_lines.append(
                    {
                        "y_center": line["y_center"],
                        "start": start,
                        "end": end,
                        "height": line["height"],
                        "x_max": line["x_max"],
                    }
                )

    if not time_lines:
        for line in lines:
            times = _extract_times(line["text"])
            if len(times) >= 2:
                start = _normalize_time(times[0])
                end = _normalize_time(times[1])
                if start and end:
                    time_lines.append(
                        {
                            "y_center": line["y_center"],
                            "start": start,
                            "end": end,
                            "height": line["height"],
                            "x_max": line["x_max"],
                        }
                    )

    if not time_lines:
        return []

    day_columns = _extract_header_day_columns(lines)
    if not day_columns:
        day_columns = _infer_day_columns(tokens, time_lines)

    if OCR_DEBUG:
        logger.info("Day columns: %s", day_columns)
        logger.info("Time lines: %s", len(time_lines))

    header_y = max((t["y_max"] for t in tokens if t["y_center"] <= image_height * 0.3), default=0)
    results: dict[tuple[str, str, str], list[str]] = {}
    time_column_max = max((line["x_max"] for line in time_lines), default=0)

    for line in lines:
        if line["y_center"] <= header_y + line["height"] * 0.5:
            continue

        line_times = _extract_times(line["text"])
        if len(line_times) >= 2:
            time_line = {
                "start": line_times[0],
                "end": line_times[1],
                "y_center": line["y_center"],
            }
        else:
            time_line = min(time_lines, key=lambda t: abs(line["y_center"] - t["y_center"]))

        start = _round_time_to_slot(time_line["start"], 30, "start")
        end = _round_time_to_slot(time_line["end"], 30, "end")
        if not start or not end:
            continue

        day_bucket: dict[str, list[dict[str, Any]]] = {}
        for token in line["tokens"]:
            if token["x_center"] <= time_column_max + 6:
                continue
            if not day_columns:
                continue
            day_key = min(day_columns, key=lambda item: abs(token["x_center"] - item[1]))[0]
            day_bucket.setdefault(day_key, []).append(token)

        for day_key, day_tokens in day_bucket.items():
            ordered = sorted(day_tokens, key=lambda t: t["x_center"])
            text = " ".join(str(t["text"]) for t in ordered).strip()
            if not text:
                continue
            key = (day_key, start, end)
            results.setdefault(key, []).append(text)

    items: list[dict[str, Any]] = []
    for (day, start, end), lines_text in results.items():
        combined = " ".join(line.strip() for line in lines_text if line.strip())
        if not combined:
            continue
        name, location, description = _extract_course_fields(combined)
        if not name:
            continue
        items.append(
            {
                "day": day,
                "start": start,
                "end": end,
                "name": name,
                "location": location or "",
                "description": description,
            }
        )

    items.sort(
        key=lambda item: (
            item["name"],
            item["day"],
            _time_to_minutes(item["start"]),
        )
    )

    merged: list[dict[str, Any]] = []
    for item in items:
        if not merged:
            merged.append(item)
            continue
        prev = merged[-1]
        gap = _time_to_minutes(item["start"]) - _time_to_minutes(prev["end"])
        if (
            prev["name"] == item["name"]
            and prev["location"] == item["location"]
            and prev["day"] == item["day"]
            and gap >= 0
            and gap <= MERGE_GAP_MINUTES
        ):
            prev["end"] = item["end"]
            continue
        merged.append(item)

    courses: dict[str, dict[str, Any]] = {}
    for item in merged:
        name = item["name"]
        if name not in courses:
            courses[name] = {
                "name": name,
                "location": item["location"],
                "description": item["description"],
                "instructor": "",
                "blocks": set(),
            }
        courses[name]["blocks"].add((item["day"], item["start"], item["end"]))

    payloads = []
    for course in courses.values():
        blocks = [
            {"day": day, "start": start, "end": end}
            for day, start, end in sorted(course["blocks"])
        ]
        payloads.append(
            {
                "name": course["name"],
                "description": course["description"],
                "instructor": course["instructor"],
                "location": course["location"],
                "blocks": blocks,
            }
        )
    return payloads


@router.options("")
async def options_courses():
    return {}


@router.get("/{username}", response_model=list[CourseResponse])
async def list_courses(username: str, db: Session = Depends(get_db)):
    courses = db.query(Course).filter(Course.username == username).all()
    return courses


@router.delete("/{username}")
async def clear_courses(username: str, db: Session = Depends(get_db)):
    profile = db.query(Profile).filter(Profile.username == username).first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found",
        )

    existing = db.query(Course).filter(Course.username == username).all()
    for course in existing:
        db.delete(course)
    db.commit()
    return {"deleted": len(existing)}


@router.post("", response_model=CourseResponse, status_code=status.HTTP_201_CREATED)
async def create_course(payload: CourseCreate, db: Session = Depends(get_db)):
    profile = db.query(Profile).filter(Profile.username == payload.username).first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found",
        )

    course = Course(
        username=payload.username,
        name=payload.name,
        description=payload.description,
        instructor=payload.instructor,
        location=payload.location,
        color=payload.color,
    )
    course.blocks = [
        CourseBlock(day=block.day, start=block.start, end=block.end)
        for block in payload.blocks
    ]

    db.add(course)
    db.commit()
    db.refresh(course)
    return course


@router.put("/{course_id}", response_model=CourseResponse)
async def update_course(
    course_id: int,
    payload: CourseUpdate,
    db: Session = Depends(get_db),
):
    course = db.query(Course).filter(Course.course_id == course_id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found",
        )

    if course.username != payload.username:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not allowed to edit this course",
        )

    course.name = payload.name
    course.description = payload.description
    course.instructor = payload.instructor
    course.location = payload.location
    if payload.color is not None:
        course.color = payload.color

    course.blocks.clear()
    course.blocks = [
        CourseBlock(day=block.day, start=block.start, end=block.end)
        for block in payload.blocks
    ]

    db.commit()
    db.refresh(course)
    return course


@router.post("/import-schedule", response_model=list[CourseResponse])
async def import_schedule(
    username: str = Form(...),
    replace_existing: bool = Form(False),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Gemini API key not configured",
        )

    profile = db.query(Profile).filter(Profile.username == username).first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found",
        )

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty image upload",
        )

    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel(GEMINI_MODEL)
    prompt = (
        "You are given a university timetable image. Extract courses and return "
        "ONLY valid JSON with this exact schema: "
        "[{\"name\": string, \"location\": string, \"description\": string, "
        "\"blocks\": [{\"day\": \"Mon|Tue|Wed|Thu|Fri|Sat|Sun\", "
        "\"start\": \"HH:MM\", \"end\": \"HH:MM\"}]}]. "
        "Use 24h time, pad with 0. Normalize short breaks by merging adjacent blocks "
        "if they are the same course with <=15 minutes gap. "
        "Do NOT include extra fields. If uncertain, best-effort guess." 
    )

    image_part = {
        "mime_type": file.content_type or "image/jpeg",
        "data": image_bytes,
    }
    response = model.generate_content([prompt, image_part])
    parsed_courses = _extract_json_payload(response.text or "")
    if OCR_DEBUG:
        logger.info(f"Parsed courses from Gemini: {json.dumps(parsed_courses, indent=2)}")
    
    if not parsed_courses:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No schedule items detected",
        )

    if replace_existing:
        existing = db.query(Course).filter(Course.username == username).all()
        for course in existing:
            db.delete(course)
        db.commit()

    created_courses = []
    for index, payload in enumerate(parsed_courses):
        course = Course(
            username=username,
            name=str(payload.get("name", "")).strip(),
            description=str(payload.get("description", "")).strip(),
            instructor="",
            location=str(payload.get("location", "")).strip(),
            color=COURSE_COLORS[index % len(COURSE_COLORS)],
        )
        raw_blocks = payload.get("blocks") or []
        blocks = _clean_blocks(raw_blocks)
        if OCR_DEBUG:
            logger.info(f"Course '{course.name}' - Raw blocks: {raw_blocks}, Cleaned blocks: {blocks}")
        if not course.name or not blocks:
            if OCR_DEBUG:
                logger.info(f"Skipping course: name={bool(course.name)}, blocks={bool(blocks)}")
            continue
        course.blocks = [
            CourseBlock(day=block["day"], start=block["start"], end=block["end"])
            for block in blocks
        ]
        db.add(course)
        created_courses.append(course)

    db.commit()
    for course in created_courses:
        db.refresh(course)
    return created_courses
