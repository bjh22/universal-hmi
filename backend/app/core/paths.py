"""Frozen-aware path helpers for PyInstaller compatibility.

When the backend is compiled with PyInstaller (``--onedir`` mode), bundled
read-only resources (fonts, static frontend) live inside ``sys._MEIPASS``
while writable runtime data (database, media uploads, projects) should be
resolved relative to the **working directory** (set by the install script).

When running from source (normal development), both helpers fall back to the
standard ``backend/`` directory so behaviour is unchanged.
"""

import sys
from pathlib import Path

# True when running inside a PyInstaller bundle.
FROZEN = getattr(sys, "frozen", False)


def bundle_dir() -> Path:
    """Root directory for **bundled read-only** resources.

    - Frozen:  ``sys._MEIPASS`` (PyInstaller's internal extraction directory)
    - Source:  ``backend/``  (two levels up from this file)
    """
    if FROZEN:
        return Path(sys._MEIPASS)  # type: ignore[attr-defined]
    return Path(__file__).resolve().parent.parent.parent


def data_dir() -> Path:
    """Root directory for **writable runtime** data (database, media, projects).

    Always returns the current working directory.  The install scripts
    (``install.sh`` / ``install.bat``) ``cd`` into the install directory before
    launching the server, so ``Path.cwd()`` points to the right place in both
    frozen and source modes.
    """
    if FROZEN:
        return Path.cwd()
    return Path(__file__).resolve().parent.parent.parent
