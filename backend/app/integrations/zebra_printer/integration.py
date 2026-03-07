"""
Zebra printer integration (ZT610, ZE511, and compatible models).

Communicates over TCP/IP port 9100 using ZPL commands and SGD queries.
Status is queried via ~HS (Host Status) command.
"""

import asyncio
import logging

from app.integrations.base import IntegrationBase
from app.integrations.zebra_printer.router import create_router
from app.services.tag_engine import TagEngine

logger = logging.getLogger(__name__)

SAMPLE_ZPL = """^XA
^FO50,50^A0N,50,50^FDTest Label^FS
^FO50,120^A0N,30,30^FD{name}^FS
^FO50,170^A0N,25,25^FD{timestamp}^FS
^FO50,210^BY3^BCN,100,Y,N,N^FD123456789^FS
^XZ"""


class ZebraPrinterIntegration(IntegrationBase):
    type_name = "zebra_printer"
    display_name = "Zebra Printer"
    description = "TCP/IP integration for Zebra label printers (ZT610, ZE511, and compatible models). Provides status monitoring, label printing, and configuration."
    default_config = {
        "host": "192.168.1.100",
        "port": 9100,
        "poll_interval_seconds": 5,
        "tag_prefix": "zebra",
    }

    TAG_DEFINITIONS = [
        {"suffix": "status", "data_type": "string", "description": "Printer status"},
        {"suffix": "labels_in_queue", "data_type": "int", "description": "Labels in print queue"},
        {"suffix": "print_speed", "data_type": "int", "description": "Print speed (in/s)"},
        {"suffix": "darkness", "data_type": "int", "description": "Print darkness (0-30)"},
        {"suffix": "head_open", "data_type": "bool", "description": "Print head open"},
        {"suffix": "paper_out", "data_type": "bool", "description": "Paper out"},
        {"suffix": "ribbon_out", "data_type": "bool", "description": "Ribbon out"},
        {"suffix": "paused", "data_type": "bool", "description": "Printer paused"},
    ]

    def __init__(self, name: str, config: dict, tag_engine: TagEngine):
        super().__init__(name, config, tag_engine)
        self._poll_task: asyncio.Task | None = None
        self._reader: asyncio.StreamReader | None = None
        self._writer: asyncio.StreamWriter | None = None
        self._lock = asyncio.Lock()

    @property
    def _prefix(self) -> str:
        return self.config.get("tag_prefix", "zebra")

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

    def get_router(self):
        return create_router(self)

    async def start(self):
        host = self.config.get("host", "192.168.1.100")
        port = self.config.get("port", 9100)
        try:
            self._reader, self._writer = await asyncio.wait_for(
                asyncio.open_connection(host, port), timeout=5.0
            )
            self.connected = True
            self.status_message = None
            self._set_tag(f"{self._prefix}.status", "Connected")
            self._poll_task = asyncio.create_task(self._poll_loop())
            logger.info(f"Connected to Zebra printer at {host}:{port}")
        except Exception as e:
            self.connected = False
            self.status_message = str(e)
            self._set_tag(f"{self._prefix}.status", f"Error: {e}")
            self._poll_task = asyncio.create_task(self._reconnect_loop())

    async def stop(self):
        if self._poll_task:
            self._poll_task.cancel()
            try:
                await self._poll_task
            except asyncio.CancelledError:
                pass
            self._poll_task = None
        await self._disconnect()
        self._set_tag(f"{self._prefix}.status", "Stopped")

    async def _disconnect(self):
        if self._writer:
            try:
                self._writer.close()
                await self._writer.wait_closed()
            except Exception:
                pass
            self._writer = None
            self._reader = None
        self.connected = False

    async def _reconnect_loop(self):
        """Retry connection with exponential backoff."""
        delay = 2
        host = self.config.get("host", "192.168.1.100")
        port = self.config.get("port", 9100)
        while True:
            await asyncio.sleep(delay)
            try:
                self._reader, self._writer = await asyncio.wait_for(
                    asyncio.open_connection(host, port), timeout=5.0
                )
                self.connected = True
                self.status_message = None
                self._set_tag(f"{self._prefix}.status", "Connected")
                logger.info(f"Reconnected to Zebra printer at {host}:{port}")
                # Switch to polling loop
                self._poll_task = asyncio.create_task(self._poll_loop())
                return
            except asyncio.CancelledError:
                raise
            except Exception:
                delay = min(delay * 2, 60)
                self._set_tag(f"{self._prefix}.status", "Reconnecting...")

    async def _poll_loop(self):
        """Periodically query printer status."""
        interval = self.config.get("poll_interval_seconds", 5)
        while True:
            try:
                await self._update_status()
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.warning(f"Zebra poll error: {e}")
                self.connected = False
                self.status_message = str(e)
                self._set_tag(f"{self._prefix}.status", f"Error: {e}")
                await self._disconnect()
                self._poll_task = asyncio.create_task(self._reconnect_loop())
                return
            await asyncio.sleep(interval)

    async def _send_command(self, command: str, expect_response: bool = True) -> str:
        """Send a command to the printer and optionally read the response."""
        async with self._lock:
            if not self._writer or not self._reader:
                raise ConnectionError("Not connected to printer")
            self._writer.write(command.encode())
            await self._writer.drain()
            if expect_response:
                data = await asyncio.wait_for(self._reader.read(4096), timeout=5.0)
                return data.decode(errors="replace").strip()
            return ""

    async def _update_status(self):
        """Query printer status via ~HS (Host Status) command."""
        response = await self._send_command("~HS\r\n")
        self._parse_host_status(response)

    def _parse_host_status(self, response: str):
        """
        Parse ~HS response. Zebra printers return 3 lines:
        Line 1: <STX>aaa,b,c,d,e,f,g,h,iii,j,k,l<CR><LF>
          aaa = paper out flag, b = paused, c = label length,
          d = number of formats in receive buffer, ...
        Line 2: <STX>mmm,n,o,p,...
          n = head open, o = ribbon out
        Line 3: <STX>yyy,z<CR><LF>
        """
        prefix = self._prefix
        lines = [
            line.strip().lstrip("\x02")
            for line in response.split("\n")
            if line.strip()
        ]

        if len(lines) < 2:
            self._set_tag(f"{prefix}.status", "Unknown")
            return

        try:
            fields1 = lines[0].split(",")
            fields2 = lines[1].split(",")

            paper_out = fields1[0].strip() != "0" if len(fields1) > 0 else False
            paused = fields1[1].strip() == "1" if len(fields1) > 1 else False
            labels_in_queue = int(fields1[3].strip()) if len(fields1) > 3 else 0

            head_open = fields2[1].strip() == "1" if len(fields2) > 1 else False
            ribbon_out = fields2[2].strip() == "1" if len(fields2) > 2 else False

            self._set_tag(f"{prefix}.paper_out", paper_out)
            self._set_tag(f"{prefix}.paused", paused)
            self._set_tag(f"{prefix}.labels_in_queue", labels_in_queue)
            self._set_tag(f"{prefix}.head_open", head_open)
            self._set_tag(f"{prefix}.ribbon_out", ribbon_out)

            # Derive overall status
            if head_open:
                status = "Head Open"
            elif paper_out:
                status = "Paper Out"
            elif ribbon_out:
                status = "Ribbon Out"
            elif paused:
                status = "Paused"
            else:
                status = "Ready"
            self._set_tag(f"{prefix}.status", status)

        except (IndexError, ValueError) as e:
            logger.debug(f"Failed to parse ~HS response: {e}")
            self._set_tag(f"{prefix}.status", "Parse Error")

    # --- Public methods called by the router ---

    async def get_full_status(self) -> dict:
        """Return full status dict for the API."""
        prefix = self._prefix
        tv = self._tag_engine.get_value

        def _val(suffix: str):
            v = tv(f"{prefix}.{suffix}")
            return v.value if v else None

        return {
            "connected": self.connected,
            "status": _val("status"),
            "labels_in_queue": _val("labels_in_queue"),
            "print_speed": _val("print_speed"),
            "darkness": _val("darkness"),
            "head_open": _val("head_open"),
            "paper_out": _val("paper_out"),
            "ribbon_out": _val("ribbon_out"),
            "paused": _val("paused"),
        }

    async def send_zpl(self, zpl: str):
        """Send raw ZPL to the printer."""
        await self._send_command(zpl, expect_response=False)

    async def send_test_label(self):
        """Send a sample test label."""
        from datetime import datetime, timezone

        zpl = SAMPLE_ZPL.format(
            name=self.name,
            timestamp=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
        )
        await self.send_zpl(zpl)

    async def set_print_speed(self, speed: int):
        """Set print speed (2-14 inches/second)."""
        zpl = f"^XA^PR{speed},{speed},{speed}^XZ"
        await self._send_command(zpl, expect_response=False)
        self._set_tag(f"{self._prefix}.print_speed", speed)

    async def set_darkness(self, darkness: int):
        """Set print darkness (0-30)."""
        zpl = f"~SD{darkness:02d}"
        await self._send_command(zpl, expect_response=False)
        self._set_tag(f"{self._prefix}.darkness", darkness)

    async def get_printer_info(self) -> dict:
        """Query printer identification via ~HI."""
        response = await self._send_command("~HI\r\n")
        return {"raw": response}
