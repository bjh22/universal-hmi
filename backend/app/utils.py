"""
Shared utility functions used across backend services and API routers.
"""

from datetime import datetime


def iso_z(dt: datetime) -> str:
    """Format a datetime as ISO 8601, appending 'Z' if no timezone info is present.

    The backend stores most timestamps as UTC-naive datetimes (no tzinfo).
    JavaScript's Date constructor requires the trailing 'Z' to interpret a
    timestamp as UTC rather than local time. This helper ensures consistent
    formatting across all API responses and WebSocket messages.

    Examples:
        >>> from datetime import datetime, timezone
        >>> iso_z(datetime(2024, 1, 1, 12, 0, 0))
        '2024-01-01T12:00:00Z'
        >>> iso_z(datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc))
        '2024-01-01T12:00:00+00:00'
    """
    return dt.isoformat() + ("" if dt.tzinfo else "Z")
