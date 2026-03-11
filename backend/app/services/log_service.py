"""
In-memory application log buffer for the Support > Logs page.

Attaches a custom logging.Handler to Python's root logger so every log message
from every service (tag_engine, alarm_service, drivers, etc.) is captured in a
bounded ring buffer.  The frontend polls GET /api/logs/ to display them.
"""

import logging
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass
class LogEntry:
    timestamp: str
    level: str
    logger_name: str
    message: str


class MemoryLogHandler(logging.Handler):
    """Stores the last *capacity* log records in a thread-safe deque."""

    def __init__(self, capacity: int = 2000):
        super().__init__()
        self._buffer: deque[LogEntry] = deque(maxlen=capacity)

    def emit(self, record: logging.LogRecord) -> None:
        entry = LogEntry(
            timestamp=datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            level=record.levelname,
            logger_name=record.name,
            message=self.format(record),
        )
        self._buffer.append(entry)

    def get_entries(
        self,
        level: str | None = None,
        search: str | None = None,
        limit: int = 500,
    ) -> tuple[list[LogEntry], int]:
        """Return filtered entries (newest first) and total count."""
        entries = list(self._buffer)
        entries.reverse()

        if level:
            lvl = level.upper()
            entries = [e for e in entries if e.level == lvl]

        if search:
            s = search.lower()
            entries = [
                e for e in entries
                if s in e.message.lower() or s in e.logger_name.lower()
            ]

        total = len(entries)
        return entries[:limit], total


# Singleton — import and attach to root logger in main.py
log_handler = MemoryLogHandler(capacity=2000)
