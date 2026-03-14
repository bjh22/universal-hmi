"""Entry point for running the HMI backend server."""

import sys
import warnings

# Suppress spurious "leaked semaphore objects" warnings from Python's
# multiprocessing resource_tracker.  On macOS (which defaults to the "spawn"
# start method since Python 3.8) the tracker runs as a separate process and
# reports semaphores created by libraries (uvicorn, asyncua, etc.) as leaked
# even when they are properly managed.  This is a known CPython issue.
if sys.platform != "win32":
    warnings.filterwarnings(
        "ignore",
        message=r"resource_tracker:.*semaphore",
        category=UserWarning,
    )

import uvicorn

from app.core.config import settings

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )
