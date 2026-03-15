# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for the HMI backend server.

Build:
    cd backend
    pyinstaller hmi-server.spec

Output:
    dist/hmi-server/          One-dir bundle
    dist/hmi-server/hmi-server   Executable (Linux/macOS)
    dist/hmi-server/hmi-server.exe  Executable (Windows)

The compiled server is launched the same way as the source version — just run
the executable from the install directory (which contains .env, data/, etc.).
"""

import os
from pathlib import Path

block_cipher = None

# Collect the built frontend if it exists (copied by deploy.sh)
_static_dir = Path("static")
static_datas = []
if _static_dir.is_dir():
    static_datas.append(("static", "static"))

a = Analysis(
    ["run.py"],
    pathex=[],
    binaries=[],
    datas=[
        # Bundled font files for ZPL rendering
        ("app/services/fonts", "app/services/fonts"),
        *static_datas,
    ],
    hiddenimports=[
        # Protocol drivers (lazy imports)
        "asyncua",
        "pycomm3",
        "pymodbus",
        "pymodbus.client",
        "pymodbus.client.tcp",
        "aiomqtt",
        # ZPL rendering dependencies (lazy imports)
        "barcode",
        "barcode.codex",
        "barcode.charsets.code128",
        "qrcode",
        # Integration plugins (lazy imports)
        "pyftpdlib",
        "pyftpdlib.handlers",
        "pyftpdlib.servers",
        # Database
        "aiosqlite",
        # Uvicorn internals
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        # Pydantic internals
        "pydantic",
        "pydantic_settings",
        # Crypto / auth
        "jose",
        "jose.jwt",
        "passlib",
        "passlib.handlers.bcrypt",
        "bcrypt",
        # Multipart form parsing
        "multipart",
        # SQLAlchemy async
        "sqlalchemy.ext.asyncio",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "alembic",
        "tkinter",
        "test",
        "unittest",
        "setuptools",
        "pip",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
    # Collect all app submodules as compiled bytecode (no .py source in output)
    module_collection_mode={
        "app": "pyz",
    },
)

# Ensure all app.integrations subpackages are collected
from PyInstaller.utils.hooks import collect_submodules

a.hiddenimports += collect_submodules("app")

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="hmi-server",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="hmi-server",
)
