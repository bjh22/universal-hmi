"""
Reporting Service: Computes production metrics from historical trend data
and alarm history on-demand.

No background loops — all metrics are computed at query time from existing
trend_data and alarm_history tables. This allows reports for any arbitrary
timeframe without requiring production runs.

Key metrics: count, reject_count, rate, uptime, downtime, idle time, OEE.

Downtime exception faults cap their downtime contribution at 5 minutes.
Time beyond 5 minutes counts as idle instead.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alarm import Alarm, AlarmHistory, AlarmState
from app.models.downtime_annotation import DowntimeAnnotation
from app.models.trend import TrendData
from app.models.tag import Tag
from app.utils import iso_z

logger = logging.getLogger(__name__)

EXCEPTION_CAP_SECONDS = 300  # 5 minutes



async def _get_tag_id_by_name(session: AsyncSession, tag_name: str) -> int | None:
    result = await session.execute(
        select(Tag.id).where(Tag.name == tag_name)
    )
    return result.scalar_one_or_none()


async def _get_tag_ids_by_names(session: AsyncSession, tag_names: list[str]) -> dict[str, int]:
    if not tag_names:
        return {}
    result = await session.execute(
        select(Tag.name, Tag.id).where(Tag.name.in_(tag_names))
    )
    return {name: tid for name, tid in result}



def _clamp_interval(
    start: datetime, end: datetime | None,
    frame_start: datetime, frame_end: datetime,
) -> tuple[datetime, datetime] | None:
    """Clamp an interval to the reporting timeframe. Returns None if no overlap."""
    s = max(start, frame_start)
    e = min(end or frame_end, frame_end)
    if s >= e:
        return None
    return (s, e)


def _normalize_dt(dt: datetime) -> datetime:
    """Ensure datetime is tz-aware UTC."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _build_intervals_from_trend(
    samples: list[tuple[datetime, float | None]],
    frame_start: datetime,
    frame_end: datetime,
) -> list[tuple[datetime, datetime]]:
    """Build intervals where the cycling tag is truthy from trend samples.

    Each sample represents the tag's value at a point in time. We assume the
    value holds until the next sample. The last sample holds until frame_end.
    """
    intervals: list[tuple[datetime, datetime]] = []
    if not samples:
        return intervals

    current_start: datetime | None = None
    for i, (ts, value) in enumerate(samples):
        ts = _normalize_dt(ts)
        # A cycling tag value >= 1.0 means the machine is running. We use >= 1.0
        # instead of > 0 because PLCs often use integer booleans (0/1) and we want
        # to avoid counting noise or transient fractional values as "running".
        is_on = bool(value and value >= 1.0)
        next_ts = _normalize_dt(samples[i + 1][0]) if i + 1 < len(samples) else frame_end

        if is_on and current_start is None:
            current_start = max(ts, frame_start)
        elif not is_on and current_start is not None:
            end = min(ts, frame_end)
            if current_start < end:
                intervals.append((current_start, end))
            current_start = None

    # Close any open interval
    if current_start is not None:
        end = frame_end
        if current_start < end:
            intervals.append((current_start, end))

    return intervals


def _total_seconds(intervals: list[tuple[datetime, datetime]]) -> float:
    return sum((e - s).total_seconds() for s, e in intervals)


def _subtract_intervals(
    base: list[tuple[datetime, datetime]],
    subtract: list[tuple[datetime, datetime]],
) -> list[tuple[datetime, datetime]]:
    """Remove subtract intervals from base intervals. Returns remaining intervals.

    Algorithm: sorts subtract intervals by start time, then for each base interval
    only checks subtraction intervals that could overlap (skips those entirely before
    or after). This avoids O(n*m) worst case for many non-overlapping intervals.
    """
    if not subtract:
        return list(base)

    sorted_sub = sorted(subtract, key=lambda x: x[0])
    result: list[tuple[datetime, datetime]] = []

    for bs, be in base:
        remaining = [(bs, be)]
        for ss, se in sorted_sub:
            if not remaining:
                break
            # All remaining subtractions start after the latest remaining piece ends
            if ss >= remaining[-1][1]:
                break
            new_remaining = []
            for rs, re in remaining:
                if se <= rs or ss >= re:
                    new_remaining.append((rs, re))
                else:
                    if ss > rs:
                        new_remaining.append((rs, ss))
                    if se < re:
                        new_remaining.append((se, re))
            remaining = new_remaining
        result.extend(remaining)
    return result


async def _get_fault_intervals(
    session: AsyncSession,
    frame_start: datetime,
    frame_end: datetime,
) -> list[dict]:
    """Get fault intervals from alarm_history and active alarms for critical-severity alarms."""
    intervals: list[dict] = []

    # Get completed alarm history entries that overlap with the timeframe
    history_result = await session.execute(
        select(AlarmHistory)
        .where(
            AlarmHistory.severity == AlarmSeverity.CRITICAL,
            AlarmHistory.triggered_at < frame_end,
            or_(
                AlarmHistory.cleared_at.is_(None),
                AlarmHistory.cleared_at > frame_start,
            ),
        )
        .order_by(AlarmHistory.triggered_at)
    )
    for h in history_result.scalars().all():
        clamped = _clamp_interval(
            _normalize_dt(h.triggered_at),
            _normalize_dt(h.cleared_at) if h.cleared_at else None,
            frame_start, frame_end,
        )
        if clamped:
            intervals.append({
                "alarm_history_id": h.id,
                "tag_name": h.tag_name,
                "tag_display_name": h.tag_display_name,
                "start": clamped[0],
                "end": clamped[1],
                "original_start": _normalize_dt(h.triggered_at),
                "original_end": _normalize_dt(h.cleared_at) if h.cleared_at else None,
            })

    # Get currently active critical alarms that overlap with the timeframe
    active_result = await session.execute(
        select(Alarm)
        .where(
            Alarm.severity == AlarmSeverity.CRITICAL,
            Alarm.state.in_([AlarmState.ACTIVE_UNACKED, AlarmState.ACTIVE_ACKED]),
            Alarm.triggered_at < frame_end,
        )
    )
    # Build tag_id -> {name, display_name} lookup for active alarms
    active_alarms = active_result.scalars().all()
    if active_alarms:
        active_tag_ids = list({a.tag_id for a in active_alarms})
        tag_info_result = await session.execute(
            select(Tag.id, Tag.name, Tag.display_name).where(Tag.id.in_(active_tag_ids))
        )
        id_to_info = {tid: {"name": name, "display_name": dname}
                      for tid, name, dname in tag_info_result}
        for a in active_alarms:
            info = id_to_info.get(a.tag_id, {"name": "", "display_name": None})
            clamped = _clamp_interval(
                _normalize_dt(a.triggered_at),
                None,  # still active
                frame_start, frame_end,
            )
            if clamped:
                intervals.append({
                    "alarm_history_id": None,
                    "tag_name": info["name"],
                    "tag_display_name": info["display_name"],
                    "start": clamped[0],
                    "end": clamped[1],
                    "original_start": _normalize_dt(a.triggered_at),
                    "original_end": None,
                })

    return intervals


async def compute_report(
    session: AsyncSession,
    settings: dict,
    frame_start: datetime,
    frame_end: datetime,
) -> dict[str, Any]:
    """Compute report metrics for the given timeframe."""
    total_seconds = (frame_end - frame_start).total_seconds()
    if total_seconds <= 0:
        return _empty_report(frame_start, frame_end, settings)

    good_count_tag = settings.get("good_count_tag")
    reject_fault_tags: list[str] = settings.get("reject_fault_tags", [])
    cycling_tag = settings.get("cycling_tag")
    exception_tags: list[str] = settings.get("downtime_exception_tags", [])
    target_rate: float | None = settings.get("target_rate")

    # 1. Get good count delta from trend data
    count = 0
    if good_count_tag:
        tag_id = await _get_tag_id_by_name(session, good_count_tag)
        if tag_id:
            count = await _get_count_delta(session, tag_id, frame_start, frame_end)

    # 2. Get reject count from alarm history
    reject_count = 0
    if reject_fault_tags:
        reject_count = await _get_reject_count(session, reject_fault_tags, frame_start, frame_end)

    # 3. Get fault intervals (downtime periods) — critical-severity alarms cause downtime
    fault_intervals = await _get_fault_intervals(
        session, frame_start, frame_end,
    )

    # 4. Apply exception capping and compute downtime
    downtime_intervals: list[tuple[datetime, datetime]] = []
    idle_from_exceptions: list[tuple[datetime, datetime]] = []

    for fi in fault_intervals:
        duration = (fi["end"] - fi["start"]).total_seconds()
        is_exception = fi["tag_name"] in exception_tags
        if is_exception and duration > EXCEPTION_CAP_SECONDS:
            # Cap downtime at 5 minutes, rest is idle
            cap_end = fi["start"] + timedelta(seconds=EXCEPTION_CAP_SECONDS)
            downtime_intervals.append((fi["start"], cap_end))
            idle_from_exceptions.append((cap_end, fi["end"]))
        else:
            downtime_intervals.append((fi["start"], fi["end"]))

    downtime_seconds = _total_seconds(downtime_intervals)

    # 5. Get cycling intervals from trend data
    uptime_seconds = 0.0
    if cycling_tag:
        tag_id = await _get_tag_id_by_name(session, cycling_tag)
        if tag_id:
            cycling_intervals = await _get_cycling_intervals(
                session, tag_id, frame_start, frame_end,
            )
            # Uptime = cycling time minus any overlap with downtime
            uptime_intervals = _subtract_intervals(cycling_intervals, downtime_intervals)
            uptime_seconds = _total_seconds(uptime_intervals)
    else:
        # No cycling tag: uptime = total - downtime
        uptime_seconds = max(0, total_seconds - downtime_seconds)

    # 6. Idle = total - uptime - downtime
    idle_seconds = max(0, total_seconds - uptime_seconds - downtime_seconds)

    # 7. Calculate derived metrics
    rate = None
    if uptime_seconds > 0:
        rate = round(count / (uptime_seconds / 3600), 2)

    # Availability = uptime / (uptime + downtime), excludes idle
    availability = None
    active_time = uptime_seconds + downtime_seconds
    if active_time > 0:
        availability = round(uptime_seconds / active_time, 4)

    # Performance = rate / target_rate
    performance = None
    if target_rate and target_rate > 0 and rate is not None:
        performance = round(min(rate / target_rate, 1.0), 4)

    # Quality = count / (count + reject_count)
    quality = None
    total_parts = count + reject_count
    if total_parts > 0:
        quality = round(count / total_parts, 4)

    # OEE = A × P × Q
    oee = None
    if availability is not None and performance is not None and quality is not None:
        oee = round(availability * performance * quality, 4)

    return {
        "count": count,
        "reject_count": reject_count,
        "rate": rate,
        "target_rate": target_rate,
        "uptime_seconds": round(uptime_seconds, 1),
        "downtime_seconds": round(downtime_seconds, 1),
        "idle_seconds": round(idle_seconds, 1),
        "availability": availability,
        "performance": performance,
        "quality": quality,
        "oee": oee,
        "timeframe": {
            "start": iso_z(frame_start),
            "end": iso_z(frame_end),
        },
    }


def _empty_report(frame_start: datetime, frame_end: datetime, settings: dict) -> dict:
    return {
        "count": 0,
        "reject_count": 0,
        "rate": None,
        "target_rate": settings.get("target_rate"),
        "uptime_seconds": 0,
        "downtime_seconds": 0,
        "idle_seconds": 0,
        "availability": None,
        "performance": None,
        "quality": None,
        "oee": None,
        "timeframe": {
            "start": iso_z(frame_start),
            "end": iso_z(frame_end),
        },
    }


async def _get_count_delta(
    session: AsyncSession, tag_id: int,
    frame_start: datetime, frame_end: datetime,
) -> int:
    """Get the delta of a counter tag over the timeframe using trend data."""
    # Get earliest value in or before timeframe
    earliest_result = await session.execute(
        select(TrendData.value)
        .where(TrendData.tag_id == tag_id, TrendData.timestamp <= frame_end)
        .order_by(TrendData.timestamp.asc())
        .where(TrendData.timestamp >= frame_start)
        .limit(1)
    )
    earliest = earliest_result.scalar_one_or_none()

    # Get latest value
    latest_result = await session.execute(
        select(TrendData.value)
        .where(
            TrendData.tag_id == tag_id,
            TrendData.timestamp >= frame_start,
            TrendData.timestamp <= frame_end,
        )
        .order_by(TrendData.timestamp.desc())
        .limit(1)
    )
    latest = latest_result.scalar_one_or_none()

    if earliest is not None and latest is not None:
        return max(0, int(latest - earliest))
    return 0


async def _get_reject_count(
    session: AsyncSession, reject_tags: list[str],
    frame_start: datetime, frame_end: datetime,
) -> int:
    """Count reject fault activations in the timeframe from alarm history."""
    # Count from alarm_history
    history_count_result = await session.execute(
        select(func.count(AlarmHistory.id))
        .where(
            AlarmHistory.tag_name.in_(reject_tags),
            AlarmHistory.triggered_at >= frame_start,
            AlarmHistory.triggered_at < frame_end,
        )
    )
    history_count = history_count_result.scalar() or 0

    # Count from active alarms (not yet in history)
    tag_ids = await _get_tag_ids_by_names(session, reject_tags)
    active_count = 0
    if tag_ids:
        active_result = await session.execute(
            select(func.count(Alarm.id))
            .where(
                Alarm.tag_id.in_(tag_ids.values()),
                Alarm.triggered_at >= frame_start,
                Alarm.triggered_at < frame_end,
                Alarm.state.in_([
                    AlarmState.ACTIVE_UNACKED,
                    AlarmState.ACTIVE_ACKED,
                    AlarmState.INACTIVE_UNACKED,
                ]),
            )
        )
        active_count = active_result.scalar() or 0

    return history_count + active_count


async def _get_cycling_intervals(
    session: AsyncSession, tag_id: int,
    frame_start: datetime, frame_end: datetime,
) -> list[tuple[datetime, datetime]]:
    """Build cycling intervals from trend data for a boolean cycling tag."""
    # Get one sample before the frame to know starting state
    pre_result = await session.execute(
        select(TrendData.timestamp, TrendData.value)
        .where(TrendData.tag_id == tag_id, TrendData.timestamp < frame_start)
        .order_by(TrendData.timestamp.desc())
        .limit(1)
    )
    pre_sample = pre_result.first()

    # Get all samples within the frame
    result = await session.execute(
        select(TrendData.timestamp, TrendData.value)
        .where(
            TrendData.tag_id == tag_id,
            TrendData.timestamp >= frame_start,
            TrendData.timestamp <= frame_end,
        )
        .order_by(TrendData.timestamp.asc())
    )
    samples = [(row.timestamp, row.value) for row in result]

    # Prepend the pre-frame sample at frame_start to know initial state
    if pre_sample:
        samples.insert(0, (frame_start, pre_sample.value))
    elif not samples:
        return []

    return _build_intervals_from_trend(samples, frame_start, frame_end)


def _merge_fault_intervals(
    intervals: list[dict],
    exception_tags: list[str],
) -> list[dict]:
    """Merge overlapping fault intervals into downtime periods.

    Each merged period contains a ``faults`` list with all contributing alarms.
    """
    if not intervals:
        return []

    sorted_ivs = sorted(intervals, key=lambda x: x["start"])

    def _make_fault(iv: dict) -> dict:
        is_exc = iv["tag_name"] in exception_tags
        return {
            "alarm_history_id": iv["alarm_history_id"],
            "tag_name": iv["tag_name"],
            "tag_display_name": iv["tag_display_name"],
            "start_time": iso_z(iv["original_start"]),
            "end_time": iso_z(iv["original_end"]) if iv["original_end"] else None,
            "is_exception": is_exc,
        }

    merged: list[dict] = []
    cur_start = sorted_ivs[0]["start"]
    cur_end = sorted_ivs[0]["end"]
    cur_orig_start = sorted_ivs[0]["original_start"]
    cur_orig_end = sorted_ivs[0]["original_end"]
    cur_faults = [_make_fault(sorted_ivs[0])]

    for iv in sorted_ivs[1:]:
        if iv["start"] <= cur_end:
            # Overlapping — extend period and add fault
            if iv["end"] > cur_end:
                cur_end = iv["end"]
            if cur_orig_end is None or iv["original_end"] is None:
                cur_orig_end = None
            elif iv["original_end"] > cur_orig_end:
                cur_orig_end = iv["original_end"]
            cur_faults.append(_make_fault(iv))
        else:
            merged.append({
                "start": cur_start, "end": cur_end,
                "original_start": cur_orig_start, "original_end": cur_orig_end,
                "faults": cur_faults,
            })
            cur_start = iv["start"]
            cur_end = iv["end"]
            cur_orig_start = iv["original_start"]
            cur_orig_end = iv["original_end"]
            cur_faults = [_make_fault(iv)]

    merged.append({
        "start": cur_start, "end": cur_end,
        "original_start": cur_orig_start, "original_end": cur_orig_end,
        "faults": cur_faults,
    })
    return merged


async def get_downtime_periods(
    session: AsyncSession,
    settings: dict,
    frame_start: datetime,
    frame_end: datetime,
) -> list[dict]:
    """Get merged downtime periods in the timeframe with per-period annotations.

    Overlapping fault intervals are merged into single downtime periods.
    Each period contains a ``faults`` list with all contributing alarms.
    """
    exception_tags: list[str] = settings.get("downtime_exception_tags", [])

    # Critical-severity alarms cause downtime
    fault_intervals = await _get_fault_intervals(
        session, frame_start, frame_end,
    )

    merged = _merge_fault_intervals(fault_intervals, exception_tags)

    # Load annotations in the timeframe; key by start_time ISO string
    ann_result = await session.execute(
        select(DowntimeAnnotation)
        .where(
            DowntimeAnnotation.start_time >= frame_start,
            DowntimeAnnotation.start_time < frame_end,
        )
    )
    annotations: dict[str, DowntimeAnnotation] = {}
    for ann in ann_result.scalars().all():
        annotations[ann.start_time.isoformat()] = ann

    periods: list[dict] = []
    for mp in merged:
        duration = (mp["end"] - mp["start"]).total_seconds()

        # Capped duration: sum each fault's capped contribution without
        # double-counting overlapping time.
        capped_intervals: list[tuple[datetime, datetime]] = []
        for fault in mp["faults"]:
            f_start_dt = datetime.fromisoformat(fault["start_time"].replace("Z", "+00:00"))
            f_end_dt = (
                datetime.fromisoformat(fault["end_time"].replace("Z", "+00:00"))
                if fault["end_time"] else frame_end
            )
            # Clamp fault to the merged period boundaries
            f_start_clamped = max(f_start_dt, mp["start"])
            f_end_clamped = min(f_end_dt, mp["end"])
            f_dur = (f_end_clamped - f_start_clamped).total_seconds()
            if fault["is_exception"] and f_dur > EXCEPTION_CAP_SECONDS:
                f_end_clamped = f_start_clamped + timedelta(seconds=EXCEPTION_CAP_SECONDS)
            if f_start_clamped < f_end_clamped:
                capped_intervals.append((f_start_clamped, f_end_clamped))
        # Merge capped intervals to avoid double-counting
        capped_intervals.sort()
        merged_capped: list[tuple[datetime, datetime]] = []
        for s, e in capped_intervals:
            if merged_capped and s <= merged_capped[-1][1]:
                merged_capped[-1] = (merged_capped[-1][0], max(merged_capped[-1][1], e))
            else:
                merged_capped.append((s, e))
        capped_duration = _total_seconds(merged_capped)

        start_iso = iso_z(mp["original_start"])
        ann = annotations.get(mp["original_start"].isoformat())
        periods.append({
            "start_time": start_iso,
            "end_time": iso_z(mp["original_end"]) if mp["original_end"] else None,
            "duration_seconds": round(duration, 1),
            "capped_duration_seconds": round(capped_duration, 1),
            "faults": mp["faults"],
            "reason_code": ann.reason_code if ann else None,
            "reason_text": ann.reason_text if ann else None,
        })

    return sorted(periods, key=lambda p: p["start_time"])


async def compute_time_series(
    session: AsyncSession,
    settings: dict,
    frame_start: datetime,
    frame_end: datetime,
    granularity: str = "day",
) -> list[dict]:
    """Compute bucketed metrics for charting.

    Fetches trend data and alarm history once for the full range, then slices
    per bucket in-memory to avoid N separate DB query rounds.
    """
    buckets = _generate_buckets(frame_start, frame_end, granularity)
    if not buckets:
        return []

    good_count_tag = settings.get("good_count_tag")
    reject_fault_tags: list[str] = settings.get("reject_fault_tags", [])
    cycling_tag = settings.get("cycling_tag")
    exception_tags: list[str] = settings.get("downtime_exception_tags", [])
    target_rate: float | None = settings.get("target_rate")

    # Pre-fetch all data for the full range once
    good_count_id = await _get_tag_id_by_name(session, good_count_tag) if good_count_tag else None
    cycling_tag_id = await _get_tag_id_by_name(session, cycling_tag) if cycling_tag else None

    # Pre-fetch all trend samples for good_count and cycling tags
    all_good_samples: list[tuple[datetime, float | None]] = []
    if good_count_id:
        result = await session.execute(
            select(TrendData.timestamp, TrendData.value)
            .where(
                TrendData.tag_id == good_count_id,
                TrendData.timestamp >= frame_start,
                TrendData.timestamp <= frame_end,
            )
            .order_by(TrendData.timestamp.asc())
        )
        all_good_samples = [(row.timestamp, row.value) for row in result]

    all_cycling_samples: list[tuple[datetime, float | None]] = []
    cycling_pre_sample: tuple[datetime, float | None] | None = None
    if cycling_tag_id:
        pre_result = await session.execute(
            select(TrendData.timestamp, TrendData.value)
            .where(TrendData.tag_id == cycling_tag_id, TrendData.timestamp < frame_start)
            .order_by(TrendData.timestamp.desc())
            .limit(1)
        )
        row = pre_result.first()
        if row:
            cycling_pre_sample = (row.timestamp, row.value)

        result = await session.execute(
            select(TrendData.timestamp, TrendData.value)
            .where(
                TrendData.tag_id == cycling_tag_id,
                TrendData.timestamp >= frame_start,
                TrendData.timestamp <= frame_end,
            )
            .order_by(TrendData.timestamp.asc())
        )
        all_cycling_samples = [(row.timestamp, row.value) for row in result]

    # Pre-fetch all fault intervals (critical-severity) for the full range
    all_fault_intervals = await _get_fault_intervals(
        session, frame_start, frame_end,
    )

    # Pre-fetch reject counts
    all_reject_history_count = 0
    reject_tag_ids: dict[str, int] = {}
    if reject_fault_tags:
        reject_tag_ids = await _get_tag_ids_by_names(session, reject_fault_tags)
        history_count_result = await session.execute(
            select(AlarmHistory.triggered_at)
            .where(
                AlarmHistory.tag_name.in_(reject_fault_tags),
                AlarmHistory.triggered_at >= frame_start,
                AlarmHistory.triggered_at < frame_end,
            )
            .order_by(AlarmHistory.triggered_at)
        )
        # Store timestamps for bucketing
        reject_history_times = [row.triggered_at for row in history_count_result]
    else:
        reject_history_times = []

    results = []
    for bucket_start, bucket_end, label in buckets:
        total_seconds = (bucket_end - bucket_start).total_seconds()
        if total_seconds <= 0:
            results.append(_make_ts_entry(label, _empty_report(bucket_start, bucket_end, settings)))
            continue

        # Slice good count samples for this bucket
        count = 0
        if good_count_id and all_good_samples:
            bucket_samples = [
                (ts, v) for ts, v in all_good_samples
                if _normalize_dt(ts) >= bucket_start and _normalize_dt(ts) <= bucket_end
            ]
            if len(bucket_samples) >= 2:
                first_v = bucket_samples[0][1]
                last_v = bucket_samples[-1][1]
                if first_v is not None and last_v is not None:
                    count = max(0, int(last_v - first_v))

        # Slice reject counts for this bucket
        reject_count = sum(
            1 for t in reject_history_times
            if _normalize_dt(t) >= bucket_start and _normalize_dt(t) < bucket_end
        )

        # Slice fault intervals for this bucket
        bucket_faults = [
            fi for fi in all_fault_intervals
            if fi["start"] < bucket_end and fi["end"] > bucket_start
        ]
        # Re-clamp to bucket boundaries
        downtime_intervals: list[tuple[datetime, datetime]] = []
        for fi in bucket_faults:
            s = max(fi["start"], bucket_start)
            e = min(fi["end"], bucket_end)
            is_exception = fi["tag_name"] in exception_tags
            duration = (e - s).total_seconds()
            if is_exception and duration > EXCEPTION_CAP_SECONDS:
                cap_end = s + timedelta(seconds=EXCEPTION_CAP_SECONDS)
                downtime_intervals.append((s, cap_end))
            else:
                downtime_intervals.append((s, e))
        downtime_seconds = _total_seconds(downtime_intervals)

        # Slice cycling samples for this bucket
        uptime_seconds = 0.0
        if cycling_tag_id:
            bucket_cycling = [
                (ts, v) for ts, v in all_cycling_samples
                if _normalize_dt(ts) >= bucket_start and _normalize_dt(ts) <= bucket_end
            ]
            # Find pre-bucket sample for initial state
            pre_sample = cycling_pre_sample
            for ts, v in all_cycling_samples:
                if _normalize_dt(ts) < bucket_start:
                    pre_sample = (ts, v)
                else:
                    break
            if pre_sample:
                bucket_cycling.insert(0, (bucket_start, pre_sample[1]))
            if bucket_cycling:
                cycling_intervals = _build_intervals_from_trend(bucket_cycling, bucket_start, bucket_end)
                uptime_intervals = _subtract_intervals(cycling_intervals, downtime_intervals)
                uptime_seconds = _total_seconds(uptime_intervals)
        else:
            uptime_seconds = max(0, total_seconds - downtime_seconds)

        idle_seconds = max(0, total_seconds - uptime_seconds - downtime_seconds)

        rate = round(count / (uptime_seconds / 3600), 2) if uptime_seconds > 0 else None
        active_time = uptime_seconds + downtime_seconds
        availability = round(uptime_seconds / active_time, 4) if active_time > 0 else None
        performance = round(min(rate / target_rate, 1.0), 4) if target_rate and target_rate > 0 and rate is not None else None
        quality = round(count / (count + reject_count), 4) if (count + reject_count) > 0 else None
        oee = round(availability * performance * quality, 4) if availability is not None and performance is not None and quality is not None else None

        results.append({
            "period": label,
            "count": count,
            "reject_count": reject_count,
            "rate": rate,
            "uptime_seconds": round(uptime_seconds, 1),
            "downtime_seconds": round(downtime_seconds, 1),
            "idle_seconds": round(idle_seconds, 1),
            "avg_oee": oee,
            "avg_availability": availability,
            "avg_performance": performance,
            "avg_quality": quality,
        })

    return results


def _make_ts_entry(label: str, report: dict) -> dict:
    return {
        "period": label,
        "count": report["count"],
        "reject_count": report["reject_count"],
        "rate": report["rate"],
        "uptime_seconds": report["uptime_seconds"],
        "downtime_seconds": report["downtime_seconds"],
        "idle_seconds": report["idle_seconds"],
        "avg_oee": report["oee"],
        "avg_availability": report["availability"],
        "avg_performance": report["performance"],
        "avg_quality": report["quality"],
    }


async def get_downtime_summary(
    session: AsyncSession,
    settings: dict,
    frame_start: datetime,
    frame_end: datetime,
) -> list[dict]:
    """Aggregate downtime by reason code for Pareto analysis."""
    periods = await get_downtime_periods(session, settings, frame_start, frame_end)

    summary: dict[str, dict] = {}
    for p in periods:
        code = p["reason_code"] or "Unassigned"
        if code not in summary:
            summary[code] = {"reason_code": code, "count": 0, "total_duration": 0}
        summary[code]["count"] += 1
        summary[code]["total_duration"] += p["capped_duration_seconds"]

    result = sorted(summary.values(), key=lambda x: x["total_duration"], reverse=True)
    return result


def _generate_buckets(
    frame_start: datetime, frame_end: datetime, granularity: str,
) -> list[tuple[datetime, datetime, str]]:
    """Generate time buckets for the given timeframe and granularity."""
    buckets: list[tuple[datetime, datetime, str]] = []

    if granularity == "month":
        current = frame_start.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        while current < frame_end:
            if current.month == 12:
                next_bucket = current.replace(year=current.year + 1, month=1)
            else:
                next_bucket = current.replace(month=current.month + 1)
            bucket_start = max(current, frame_start)
            bucket_end = min(next_bucket, frame_end)
            label = current.strftime("%Y-%m")
            buckets.append((bucket_start, bucket_end, label))
            current = next_bucket

    elif granularity == "week":
        # Start from Monday of the start week
        current = frame_start - timedelta(days=frame_start.weekday())
        current = current.replace(hour=0, minute=0, second=0, microsecond=0)
        while current < frame_end:
            next_bucket = current + timedelta(weeks=1)
            bucket_start = max(current, frame_start)
            bucket_end = min(next_bucket, frame_end)
            iso_year, iso_week, _ = current.isocalendar()
            label = f"{iso_year}-W{iso_week:02d}"
            buckets.append((bucket_start, bucket_end, label))
            current = next_bucket

    else:  # day
        current = frame_start.replace(hour=0, minute=0, second=0, microsecond=0)
        while current < frame_end:
            next_bucket = current + timedelta(days=1)
            bucket_start = max(current, frame_start)
            bucket_end = min(next_bucket, frame_end)
            label = current.strftime("%Y-%m-%d")
            buckets.append((bucket_start, bucket_end, label))
            current = next_bucket

    return buckets
