"""
FTP Hot Folder integration.

Runs an FTP server that accepts file uploads. Each uploaded file is sent
directly to a Zebra printer via TCP (port 9100) as ASCII/ZPL, then deleted.
"""

import asyncio
import logging
import os
import socket
import tempfile
import threading

from pyftpdlib.authorizers import DummyAuthorizer
from pyftpdlib.handlers import FTPHandler
from pyftpdlib.servers import FTPServer

from app.integrations.base import IntegrationBase
from app.services.tag_engine import TagEngine

logger = logging.getLogger(__name__)


class FtpHotFolderIntegration(IntegrationBase):
    type_name = "ftp_hot_folder"
    display_name = "FTP Hot Folder"
    description = "FTP server that forwards uploaded files to a Zebra printer as ZPL. Files are deleted after printing."
    default_config = {
        "ftp_port": 2121,
        "printer_host": "192.168.1.100",
        "printer_port": 9100,
        "tag_prefix": "ftp",
    }

    TAG_DEFINITIONS = [
        {"suffix": "status", "data_type": "string", "description": "FTP server status"},
        {"suffix": "files_processed", "data_type": "int", "description": "Total files sent to printer"},
        {"suffix": "last_file", "data_type": "string", "description": "Last file received"},
    ]

    def __init__(self, name: str, config: dict, tag_engine: TagEngine):
        super().__init__(name, config, tag_engine)
        self._server: FTPServer | None = None
        self._thread: threading.Thread | None = None
        self._temp_dir: str | None = None
        self._files_processed = 0

    @property
    def _prefix(self) -> str:
        return self.config.get("tag_prefix", "ftp")

    def get_tag_definitions(self) -> list[dict]:
        prefix = self._prefix
        return [
            {
                "name": f"{prefix}.{td['suffix']}",
                "data_type": td["data_type"],
                "description": td["description"],
                "access_mode": "read",
            }
            for td in self.TAG_DEFINITIONS
        ]

    async def start(self):
        ftp_port = int(self.config.get("ftp_port", 2121))
        printer_host = self.config.get("printer_host", "192.168.1.100")
        printer_port = int(self.config.get("printer_port", 9100))
        prefix = self._prefix

        # Create temp directory for hot folder
        self._temp_dir = tempfile.mkdtemp(prefix="hmi_ftp_")
        logger.info(f"FTP hot folder: {self._temp_dir}")

        # Build the FTP handler with a callback that sends files to the printer
        integration = self  # capture for closure

        class HotFolderHandler(FTPHandler):
            def on_file_received(self, file: str):
                """Called when a file upload completes."""
                filename = os.path.basename(file)
                try:
                    with open(file, "r", errors="replace") as f:
                        contents = f.read()

                    # Send to printer via TCP
                    with socket.create_connection(
                        (printer_host, printer_port), timeout=10
                    ) as sock:
                        sock.sendall(contents.encode())

                    integration._files_processed += 1
                    integration._set_tag(
                        f"{prefix}.files_processed",
                        integration._files_processed,
                    )
                    integration._set_tag(f"{prefix}.last_file", filename)
                    logger.info(f"FTP: Sent {filename} to printer ({len(contents)} bytes)")

                except Exception as e:
                    logger.error(f"FTP: Failed to send {filename} to printer: {e}")
                    integration._set_tag(
                        f"{prefix}.status",
                        f"Print error: {e}",
                    )
                finally:
                    # Always delete the file
                    try:
                        os.remove(file)
                    except OSError:
                        pass

        # Configure anonymous FTP
        authorizer = DummyAuthorizer()
        authorizer.add_anonymous(self._temp_dir, perm="elradfmw")

        handler = HotFolderHandler
        handler.authorizer = authorizer
        handler.banner = "HMI FTP Hot Folder"
        handler.passive_ports = range(60000, 60100)

        try:
            self._server = FTPServer(("0.0.0.0", ftp_port), handler)
            self._server.max_cons = 5
            self._server.max_cons_per_ip = 3
        except OSError as e:
            self.connected = False
            self.status_message = str(e)
            self._set_tag(f"{prefix}.status", f"Error: {e}")
            raise

        # Run FTP server in a background thread
        self._thread = threading.Thread(
            target=self._server.serve_forever,
            daemon=True,
            name=f"ftp-{self.name}",
        )
        self._thread.start()

        self.connected = True
        self.status_message = None
        self._set_tag(f"{prefix}.status", f"Listening on port {ftp_port}")
        self._set_tag(f"{prefix}.files_processed", 0)
        self._set_tag(f"{prefix}.last_file", "")
        logger.info(f"FTP hot folder started on port {ftp_port}")

    async def stop(self):
        prefix = self._prefix
        if self._server:
            self._server.close_all()
            self._server = None
        if self._thread:
            self._thread.join(timeout=5)
            self._thread = None
        if self._temp_dir:
            try:
                # Clean up any remaining files
                for f in os.listdir(self._temp_dir):
                    os.remove(os.path.join(self._temp_dir, f))
                os.rmdir(self._temp_dir)
            except OSError:
                pass
            self._temp_dir = None
        self.connected = False
        self._set_tag(f"{prefix}.status", "Stopped")
