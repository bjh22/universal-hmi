"""
ZPL Renderer — Offline ZPL-to-PNG rendering using Pillow.

Parses ZPL II commands and renders them onto a bitmap image. Supports text,
barcodes (Code 128, Code 39), QR codes, graphic boxes, graphic fields, field
blocks, and common formatting commands.

Unsupported commands are silently skipped so partial renders always succeed.
"""

from __future__ import annotations

import io
import logging
import re
import struct
import zlib
from dataclasses import dataclass, field
from typing import Sequence

from PIL import Image, ImageDraw, ImageFont

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# ZPL font metrics (approximate).  ZPL fonts A-Z and 0 have fixed character
# cell sizes at 203 DPI.  We scale proportionally for other DPIs.
# Format: (char_width, char_height) in dots at 203 DPI.
# ---------------------------------------------------------------------------
_ZPL_FONT_METRICS: dict[str, tuple[int, int]] = {
    "0": (15, 12),
    "A": (9, 5),
    "B": (11, 7),
    "C": (18, 10),
    "D": (18, 10),
    "E": (28, 15),
    "F": (26, 13),
    "G": (60, 40),
    "H": (21, 13),
}

# ---------------------------------------------------------------------------
# Rotation helpers
# ---------------------------------------------------------------------------
_ROTATION_MAP = {"N": 0, "R": 90, "I": 180, "B": 270}


def _rotate_point(x: int, y: int, w: int, h: int, rotation: int) -> tuple[int, int]:
    """Rotate a field origin based on ZPL rotation convention."""
    if rotation == 90:
        return (x, y - w)
    if rotation == 180:
        return (x - w, y - h)
    if rotation == 270:
        return (x - h, y)
    return (x, y)


# ---------------------------------------------------------------------------
# Label state
# ---------------------------------------------------------------------------
@dataclass
class _LabelState:
    """Mutable state accumulated while processing ZPL commands."""
    dpi: int = 203
    label_width: int = 812       # ~4 inches at 203 DPI
    label_height: int = 1218     # ~6 inches at 203 DPI
    label_home_x: int = 0
    label_home_y: int = 0
    field_origin_x: int = 0
    field_origin_y: int = 0
    field_typeset: bool = False
    default_font: str = "0"
    default_font_h: int = 15
    default_font_w: int = 12
    current_font: str = "0"
    current_font_h: int = 0
    current_font_w: int = 0
    field_rotation: int = 0       # degrees: 0, 90, 180, 270
    field_reverse: bool = False
    barcode_module_width: int = 2
    barcode_wide_ratio: float = 3.0
    barcode_height: int = 10
    encoding: int = 0             # ^CI value
    field_data: str = ""
    field_block: tuple[int, int, int, str] | None = None  # (width, max_lines, line_spacing, justification)


# ---------------------------------------------------------------------------
# Command handlers
# ---------------------------------------------------------------------------

def _parse_int(s: str, default: int = 0) -> int:
    try:
        return int(s)
    except (ValueError, TypeError):
        return default


def _parse_float(s: str, default: float = 0.0) -> float:
    try:
        return float(s)
    except (ValueError, TypeError):
        return default


def _split_params(params: str) -> list[str]:
    """Split comma-separated ZPL parameters, preserving empty segments."""
    return params.split(",") if params else []


def _get_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    """Return a Pillow font at the requested pixel height."""
    try:
        # Try to use a bundled or system TrueType font
        font = ImageFont.truetype("DejaVuSansMono.ttf", size)
        return font
    except (OSError, IOError):
        pass
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", size)
        return font
    except (OSError, IOError):
        pass
    try:
        font = ImageFont.truetype("arial.ttf", size)
        return font
    except (OSError, IOError):
        pass
    return ImageFont.load_default()


def _handle_LH(state: _LabelState, params: str) -> None:
    parts = _split_params(params)
    if len(parts) >= 2:
        state.label_home_x = _parse_int(parts[0])
        state.label_home_y = _parse_int(parts[1])


def _handle_PW(state: _LabelState, params: str) -> None:
    if params.strip():
        state.label_width = _parse_int(params.strip(), state.label_width)


def _handle_LL(state: _LabelState, params: str) -> None:
    if params.strip():
        state.label_height = _parse_int(params.strip(), state.label_height)


def _handle_FO(state: _LabelState, params: str) -> None:
    parts = _split_params(params)
    state.field_origin_x = _parse_int(parts[0]) if len(parts) >= 1 else 0
    state.field_origin_y = _parse_int(parts[1]) if len(parts) >= 2 else 0
    state.field_typeset = False


def _handle_FT(state: _LabelState, params: str) -> None:
    parts = _split_params(params)
    if len(parts) >= 1 and parts[0].strip():
        state.field_origin_x = _parse_int(parts[0])
    if len(parts) >= 2 and parts[1].strip():
        state.field_origin_y = _parse_int(parts[1])
    state.field_typeset = True


def _handle_CF(state: _LabelState, params: str) -> None:
    parts = _split_params(params)
    if len(parts) >= 1 and parts[0].strip():
        state.default_font = parts[0].strip()[0]
    if len(parts) >= 2 and parts[1].strip():
        state.default_font_h = _parse_int(parts[1], state.default_font_h)
    if len(parts) >= 3 and parts[2].strip():
        state.default_font_w = _parse_int(parts[2], state.default_font_w)


def _handle_A(state: _LabelState, params: str) -> None:
    """^Af,o,h,w — font selection for current field."""
    if not params:
        return
    font_name = params[0]
    rest = params[1:]
    parts = _split_params(rest)
    rotation = "N"
    height = 0
    width = 0
    if len(parts) >= 1 and parts[0].strip():
        rotation = parts[0].strip()
    if len(parts) >= 2 and parts[1].strip():
        height = _parse_int(parts[1])
    if len(parts) >= 3 and parts[2].strip():
        width = _parse_int(parts[2])
    state.current_font = font_name
    state.current_font_h = height
    state.current_font_w = width
    if rotation in _ROTATION_MAP:
        state.field_rotation = _ROTATION_MAP[rotation]


def _handle_FW(state: _LabelState, params: str) -> None:
    if params.strip() and params.strip()[0] in _ROTATION_MAP:
        state.field_rotation = _ROTATION_MAP[params.strip()[0]]


def _handle_BY(state: _LabelState, params: str) -> None:
    parts = _split_params(params)
    if len(parts) >= 1 and parts[0].strip():
        state.barcode_module_width = _parse_int(parts[0], state.barcode_module_width)
    if len(parts) >= 2 and parts[1].strip():
        state.barcode_wide_ratio = _parse_float(parts[1], state.barcode_wide_ratio)
    if len(parts) >= 3 and parts[2].strip():
        state.barcode_height = _parse_int(parts[2], state.barcode_height)


def _handle_FD(state: _LabelState, params: str) -> None:
    state.field_data = params


def _handle_FR(state: _LabelState, _params: str) -> None:
    state.field_reverse = True


def _handle_FB(state: _LabelState, params: str) -> None:
    parts = _split_params(params)
    width = _parse_int(parts[0], 0) if len(parts) >= 1 else 0
    max_lines = _parse_int(parts[1], 1) if len(parts) >= 2 else 1
    line_spacing = _parse_int(parts[2], 0) if len(parts) >= 3 else 0
    justification = parts[3].strip() if len(parts) >= 4 else "L"
    state.field_block = (width, max_lines, line_spacing, justification)


def _handle_CI(state: _LabelState, params: str) -> None:
    if params.strip():
        state.encoding = _parse_int(params.strip())


# ---------------------------------------------------------------------------
# Drawing helpers
# ---------------------------------------------------------------------------

def _draw_text(
    draw: ImageDraw.ImageDraw,
    state: _LabelState,
    text: str,
) -> None:
    """Draw a text field at the current field origin."""
    font_h = state.current_font_h or state.default_font_h
    font_w = state.current_font_w or state.default_font_w
    # Use the larger dimension for font size
    font_size = max(font_h, font_w, 10)
    font = _get_font(font_size)

    x = state.label_home_x + state.field_origin_x
    y = state.label_home_y + state.field_origin_y

    fill = 0 if not state.field_reverse else 255

    if state.field_block:
        _draw_field_block(draw, state, text, font, x, y, fill)
    elif state.field_typeset:
        # ^FT positions the baseline, not the top
        bbox = font.getbbox(text)
        text_height = bbox[3] - bbox[1] if bbox else font_size
        draw.text((x, y - text_height), text, fill=fill, font=font)
    else:
        draw.text((x, y), text, fill=fill, font=font)


def _draw_field_block(
    draw: ImageDraw.ImageDraw,
    state: _LabelState,
    text: str,
    font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
    x: int,
    y: int,
    fill: int,
) -> None:
    """Draw text with word wrapping (^FB)."""
    if not state.field_block:
        return
    block_width, max_lines, line_spacing, justification = state.field_block

    # Simple word-wrap
    words = text.split()
    lines: list[str] = []
    current_line = ""
    for word in words:
        test = f"{current_line} {word}".strip()
        bbox = font.getbbox(test)
        tw = bbox[2] - bbox[0] if bbox else len(test) * 8
        if tw > block_width and current_line:
            lines.append(current_line)
            current_line = word
        else:
            current_line = test
    if current_line:
        lines.append(current_line)

    lines = lines[:max_lines] if max_lines > 0 else lines

    font_h = state.current_font_h or state.default_font_h or 15
    for i, line in enumerate(lines):
        ly = y + i * (font_h + line_spacing)
        # Justification
        bbox = font.getbbox(line)
        tw = bbox[2] - bbox[0] if bbox else len(line) * 8
        if justification == "C":
            lx = x + (block_width - tw) // 2
        elif justification == "R":
            lx = x + block_width - tw
        else:
            lx = x
        draw.text((lx, ly), line, fill=fill, font=font)


def _draw_graphic_box(
    draw: ImageDraw.ImageDraw,
    state: _LabelState,
    params: str,
) -> None:
    """^GB — draw a rectangle/line."""
    parts = _split_params(params)
    w = _parse_int(parts[0], 1) if len(parts) >= 1 else 1
    h = _parse_int(parts[1], 1) if len(parts) >= 2 else 1
    thickness = _parse_int(parts[2], 1) if len(parts) >= 3 else 1
    color = parts[3].strip() if len(parts) >= 4 else "B"
    corner_rounding = _parse_int(parts[4], 0) if len(parts) >= 5 else 0

    x = state.label_home_x + state.field_origin_x
    y = state.label_home_y + state.field_origin_y

    fill_color = 0 if color == "B" else 255
    if state.field_reverse:
        fill_color = 255 if fill_color == 0 else 0

    if w <= 0:
        w = thickness
    if h <= 0:
        h = thickness

    # If thickness >= width or height, draw filled
    if thickness >= w or thickness >= h:
        if corner_rounding > 0:
            r = min(corner_rounding * min(w, h) // 16, min(w, h) // 2)
            draw.rounded_rectangle([x, y, x + w, y + h], radius=r, fill=fill_color)
        else:
            draw.rectangle([x, y, x + w, y + h], fill=fill_color)
    else:
        # Draw border only
        for t in range(thickness):
            draw.rectangle(
                [x + t, y + t, x + w - t, y + h - t],
                outline=fill_color,
            )


def _draw_graphic_diagonal(
    draw: ImageDraw.ImageDraw,
    state: _LabelState,
    params: str,
) -> None:
    """^GD — draw a diagonal line."""
    parts = _split_params(params)
    w = _parse_int(parts[0], 1) if len(parts) >= 1 else 1
    h = _parse_int(parts[1], 1) if len(parts) >= 2 else 1
    thickness = _parse_int(parts[2], 1) if len(parts) >= 3 else 1
    color = parts[3].strip() if len(parts) >= 4 else "B"
    orientation = parts[4].strip() if len(parts) >= 5 else "R"

    x = state.label_home_x + state.field_origin_x
    y = state.label_home_y + state.field_origin_y

    fill_color = 0 if color == "B" else 255

    if orientation == "L":
        draw.line([x + w, y, x, y + h], fill=fill_color, width=thickness)
    else:
        draw.line([x, y, x + w, y + h], fill=fill_color, width=thickness)


def _draw_graphic_circle(
    draw: ImageDraw.ImageDraw,
    state: _LabelState,
    params: str,
) -> None:
    """^GC — draw a circle."""
    parts = _split_params(params)
    diameter = _parse_int(parts[0], 1) if len(parts) >= 1 else 1
    thickness = _parse_int(parts[1], 1) if len(parts) >= 2 else 1
    color = parts[2].strip() if len(parts) >= 3 else "B"

    x = state.label_home_x + state.field_origin_x
    y = state.label_home_y + state.field_origin_y

    fill_color = 0 if color == "B" else 255

    if thickness >= diameter // 2:
        draw.ellipse([x, y, x + diameter, y + diameter], fill=fill_color)
    else:
        for t in range(thickness):
            draw.ellipse(
                [x + t, y + t, x + diameter - t, y + diameter - t],
                outline=fill_color,
            )


def _draw_graphic_field(
    image: Image.Image,
    state: _LabelState,
    params: str,
    field_data: str,
) -> None:
    """^GF — draw an inline graphic (hex or compressed)."""
    parts = _split_params(params)
    if len(parts) < 4:
        return
    fmt = parts[0].strip().upper()  # A=ASCII hex, B=binary, C=compressed
    data_bytes = _parse_int(parts[1], 0)
    total_bytes = _parse_int(parts[2], 0)
    bytes_per_row = _parse_int(parts[3], 0)

    if bytes_per_row <= 0:
        return

    x = state.label_home_x + state.field_origin_x
    y = state.label_home_y + state.field_origin_y

    # Decode hex data
    raw = field_data.replace("\n", "").replace("\r", "").replace(" ", "")
    if fmt == "A":
        raw = _expand_zpl_hex(raw, bytes_per_row)
        pixel_data = bytes.fromhex(raw) if raw else b""
    else:
        # Binary / compressed — best-effort hex decode
        raw = _expand_zpl_hex(raw, bytes_per_row)
        try:
            pixel_data = bytes.fromhex(raw) if raw else b""
        except ValueError:
            return

    if not pixel_data:
        return

    width_pixels = bytes_per_row * 8
    height_pixels = len(pixel_data) // bytes_per_row if bytes_per_row else 1

    try:
        gf_img = Image.frombytes("1", (width_pixels, height_pixels), pixel_data)
        # Invert: in ZPL, 1 = black, but Pillow mode "1" has 1 = white
        gf_img = gf_img.point(lambda p: 0 if p else 255)
        # Convert to 'L' for pasting onto the label
        gf_img = gf_img.convert("L")
        image.paste(gf_img, (x, y))
    except Exception as e:
        logger.debug("Failed to render ^GF: %s", e)


def _expand_zpl_hex(data: str, bytes_per_row: int) -> str:
    """Expand ZPL hex compression (run-length encoding) to full hex string."""
    # ZPL uses letters G-Y and g-z as repeat counters
    # G=1, H=2, ... Y=19, g=20, h=40, ... z=400
    result: list[str] = []
    i = 0
    row_chars = bytes_per_row * 2  # 2 hex chars per byte
    last_row = ""

    while i < len(data):
        ch = data[i]
        if ch == ":":
            # Repeat last row
            result.append(last_row if last_row else "0" * row_chars)
            i += 1
        elif ch == ",":
            # Fill rest of row with 00
            current = "".join(result)
            chars_in_row = len(current) % row_chars if row_chars else 0
            remaining = row_chars - chars_in_row if chars_in_row else 0
            result.append("0" * remaining)
            last_row = current[-row_chars:] if len(current) >= row_chars else current
            i += 1
        elif ch == "!":
            # Fill rest of row with FF
            current = "".join(result)
            chars_in_row = len(current) % row_chars if row_chars else 0
            remaining = row_chars - chars_in_row if chars_in_row else 0
            result.append("F" * remaining)
            last_row = current[-row_chars:] if len(current) >= row_chars else current
            i += 1
        elif ch in "GHIJKLMNOPQRSTUVWXYghijklmnopqrstuvwxyz":
            # Repeat count
            count = _zpl_repeat_count(ch)
            i += 1
            if i < len(data):
                hex_char = data[i]
                result.append(hex_char * count)
                i += 1
        else:
            result.append(ch)
            i += 1

    return "".join(result)


def _zpl_repeat_count(ch: str) -> int:
    """Get the repeat count for a ZPL compression character."""
    if "G" <= ch <= "Y":
        return ord(ch) - ord("G") + 1
    if "g" <= ch <= "z":
        return (ord(ch) - ord("g") + 1) * 20
    return 1


def _draw_barcode_128(
    draw: ImageDraw.ImageDraw,
    state: _LabelState,
    params: str,
) -> None:
    """^BC — Code 128 barcode. Rendered using simple bar pattern."""
    parts = _split_params(params)
    orientation = parts[0].strip() if len(parts) >= 1 and parts[0].strip() else "N"
    height = _parse_int(parts[1], state.barcode_height) if len(parts) >= 2 and parts[1].strip() else state.barcode_height
    print_text = parts[2].strip().upper() if len(parts) >= 3 else "Y"
    text_above = parts[3].strip().upper() if len(parts) >= 4 else "N"

    text = state.field_data
    if not text:
        return

    x = state.label_home_x + state.field_origin_x
    y = state.label_home_y + state.field_origin_y
    module = state.barcode_module_width

    try:
        import barcode as barcode_lib
        from barcode.writer import ImageWriter

        writer = ImageWriter()
        writer.set_options({
            "module_width": module * 0.264,  # dots to mm approx
            "module_height": height * 0.264,
            "write_text": False,
            "quiet_zone": 0,
        })

        # Strip Code 128 subset prefixes
        data = text
        if data.startswith((">:", ">9", ">5", ">6")):
            data = data[2:]

        code = barcode_lib.get("code128", data, writer=writer)
        buf = io.BytesIO()
        code.write(buf)
        buf.seek(0)
        bc_img = Image.open(buf).convert("L")

        # Scale to match module width
        target_w = int(bc_img.width * module / 2)
        target_h = height
        bc_img = bc_img.resize((target_w, target_h), Image.NEAREST)

        # Paste onto label
        mask = bc_img.point(lambda p: 255 if p < 128 else 0)
        draw.bitmap((x, y), mask, fill=0)

        # Human-readable text below
        if print_text == "Y":
            font = _get_font(max(state.default_font_h, 12))
            text_y = y + height + 2 if text_above != "Y" else y - state.default_font_h - 2
            draw.text((x, text_y), text, fill=0, font=font)

    except ImportError:
        # Fallback: draw a placeholder rectangle
        w = len(text) * module * 11
        draw.rectangle([x, y, x + w, y + height], outline=0)
        font = _get_font(10)
        draw.text((x + 2, y + 2), f"[Code128: {text}]", fill=0, font=font)
    except Exception as e:
        logger.debug("Barcode rendering error: %s", e)
        w = len(text) * module * 11
        draw.rectangle([x, y, x + w, y + height], outline=0)


def _draw_barcode_39(
    draw: ImageDraw.ImageDraw,
    state: _LabelState,
    params: str,
) -> None:
    """^B3 — Code 39 barcode."""
    parts = _split_params(params)
    orientation = parts[0].strip() if len(parts) >= 1 and parts[0].strip() else "N"
    check_digit = parts[1].strip().upper() if len(parts) >= 2 else "N"
    height = _parse_int(parts[2], state.barcode_height) if len(parts) >= 3 and parts[2].strip() else state.barcode_height
    print_text = parts[3].strip().upper() if len(parts) >= 4 else "Y"
    text_above = parts[4].strip().upper() if len(parts) >= 5 else "N"

    text = state.field_data
    if not text:
        return

    x = state.label_home_x + state.field_origin_x
    y = state.label_home_y + state.field_origin_y
    module = state.barcode_module_width

    try:
        import barcode as barcode_lib
        from barcode.writer import ImageWriter

        writer = ImageWriter()
        writer.set_options({
            "module_width": module * 0.264,
            "module_height": height * 0.264,
            "write_text": False,
            "quiet_zone": 0,
        })

        code = barcode_lib.get("code39", text, writer=writer)
        buf = io.BytesIO()
        code.write(buf)
        buf.seek(0)
        bc_img = Image.open(buf).convert("L")

        target_w = int(bc_img.width * module / 2)
        target_h = height
        bc_img = bc_img.resize((target_w, target_h), Image.NEAREST)

        mask = bc_img.point(lambda p: 255 if p < 128 else 0)
        draw.bitmap((x, y), mask, fill=0)

        if print_text == "Y":
            font = _get_font(max(state.default_font_h, 12))
            text_y = y + height + 2 if text_above != "Y" else y - state.default_font_h - 2
            draw.text((x, text_y), text, fill=0, font=font)

    except ImportError:
        w = len(text) * module * 16
        draw.rectangle([x, y, x + w, y + height], outline=0)
        font = _get_font(10)
        draw.text((x + 2, y + 2), f"[Code39: {text}]", fill=0, font=font)
    except Exception as e:
        logger.debug("Code 39 rendering error: %s", e)


def _draw_qr_code(
    draw: ImageDraw.ImageDraw,
    image: Image.Image,
    state: _LabelState,
    params: str,
) -> None:
    """^BQ — QR code."""
    parts = _split_params(params)
    orientation = parts[0].strip() if len(parts) >= 1 and parts[0].strip() else "N"
    model = _parse_int(parts[1], 2) if len(parts) >= 2 and parts[1].strip() else 2
    magnification = _parse_int(parts[2], 3) if len(parts) >= 3 and parts[2].strip() else 3

    text = state.field_data
    if not text:
        return

    # ZPL QR data format: error_correction + "A," + data
    # e.g. "QA,Hello World" where Q=quality, A=auto mode
    if len(text) >= 2 and text[1] in "aA":
        # Strip the error correction + mode prefix
        data = text[3:] if len(text) > 3 and text[2] == "," else text[2:]
    elif "," in text:
        data = text.split(",", 1)[1]
    else:
        data = text

    x = state.label_home_x + state.field_origin_x
    y = state.label_home_y + state.field_origin_y

    try:
        import qrcode as qr_lib

        qr = qr_lib.QRCode(
            version=1,
            error_correction=qr_lib.constants.ERROR_CORRECT_M,
            box_size=magnification,
            border=0,
        )
        qr.add_data(data)
        qr.make(fit=True)
        qr_img = qr.make_image(fill_color="black", back_color="white").convert("L")
        image.paste(qr_img, (x, y))
    except ImportError:
        size = magnification * 21
        draw.rectangle([x, y, x + size, y + size], outline=0)
        font = _get_font(10)
        draw.text((x + 2, y + 2), "[QR]", fill=0, font=font)
    except Exception as e:
        logger.debug("QR code rendering error: %s", e)


def _draw_barcode_ean13(
    draw: ImageDraw.ImageDraw,
    state: _LabelState,
    params: str,
) -> None:
    """^BE — EAN-13 barcode."""
    parts = _split_params(params)
    height = _parse_int(parts[1], state.barcode_height) if len(parts) >= 2 and parts[1].strip() else state.barcode_height
    print_text = parts[2].strip().upper() if len(parts) >= 3 else "Y"

    text = state.field_data
    if not text:
        return

    x = state.label_home_x + state.field_origin_x
    y = state.label_home_y + state.field_origin_y
    module = state.barcode_module_width

    try:
        import barcode as barcode_lib
        from barcode.writer import ImageWriter

        writer = ImageWriter()
        writer.set_options({
            "module_width": module * 0.264,
            "module_height": height * 0.264,
            "write_text": False,
            "quiet_zone": 0,
        })
        code = barcode_lib.get("ean13", text[:12], writer=writer)
        buf = io.BytesIO()
        code.write(buf)
        buf.seek(0)
        bc_img = Image.open(buf).convert("L")
        target_h = height
        bc_img = bc_img.resize((int(bc_img.width * module / 2), target_h), Image.NEAREST)
        mask = bc_img.point(lambda p: 255 if p < 128 else 0)
        draw.bitmap((x, y), mask, fill=0)
        if print_text == "Y":
            font = _get_font(max(state.default_font_h, 12))
            draw.text((x, y + height + 2), text, fill=0, font=font)
    except Exception as e:
        logger.debug("EAN-13 rendering error: %s", e)


# ---------------------------------------------------------------------------
# Tokenizer
# ---------------------------------------------------------------------------

def _tokenize_zpl(zpl: str) -> list[tuple[str, str]]:
    """
    Split ZPL into (command, params) tuples.
    Handles ^FD and ^GF specially as they consume data until ^FS/next ^.
    """
    tokens: list[tuple[str, str]] = []
    i = 0
    n = len(zpl)

    while i < n:
        # Skip to next command prefix
        if zpl[i] in ("^", "~"):
            prefix = zpl[i]
            i += 1
            # Read 2-char command name
            cmd = ""
            while i < n and len(cmd) < 2 and zpl[i] not in ("^", "~", "\n", "\r"):
                cmd += zpl[i]
                i += 1

            cmd = cmd.upper()

            if cmd == "FD" or cmd == "FN":
                # Field data: consume until ^FS or next ^
                fd_start = i
                while i < n:
                    if zpl[i] == "^":
                        break
                    i += 1
                params = zpl[fd_start:i]
                tokens.append((cmd, params))
            elif cmd == "GF":
                # Graphic field: collect params then data until ^FS
                gf_start = i
                # Find the end - ^FS or next command
                depth = 0
                while i < n:
                    if zpl[i] == "^":
                        # Check if it's ^FS
                        if i + 2 < n and zpl[i + 1:i + 3].upper() == "FS":
                            break
                        # Any other ^ command ends the GF
                        break
                    i += 1
                params = zpl[gf_start:i]
                tokens.append((cmd, params))
            elif cmd == "FX":
                # Comment: consume until ^FS or next ^
                while i < n and zpl[i] != "^":
                    i += 1
                # Skip this token (it's a comment)
            else:
                # Regular command: consume params until next ^ or ~
                param_start = i
                while i < n and zpl[i] not in ("^", "~"):
                    i += 1
                params = zpl[param_start:i].strip()
                tokens.append((cmd, params))
        else:
            i += 1

    return tokens


# ---------------------------------------------------------------------------
# Main renderer
# ---------------------------------------------------------------------------

def _render_single_label(zpl: str, dpi: int = 203, width_dots: int | None = None) -> Image.Image:
    """Render a single ^XA...^XZ label to a Pillow Image."""
    state = _LabelState(dpi=dpi)
    if width_dots:
        state.label_width = width_dots

    # Scale default dimensions for DPI
    if dpi != 203:
        scale = dpi / 203
        state.label_width = int(state.label_width * scale)
        state.label_height = int(state.label_height * scale)
        state.default_font_h = int(state.default_font_h * scale)
        state.default_font_w = int(state.default_font_w * scale)

    # First pass: scan for ^PW and ^LL to determine label size
    tokens = _tokenize_zpl(zpl)
    for cmd, params in tokens:
        if cmd == "PW":
            _handle_PW(state, params)
        elif cmd == "LL":
            _handle_LL(state, params)

    # Create image
    image = Image.new("L", (state.label_width, state.label_height), 255)
    draw = ImageDraw.Draw(image)

    # Pending barcode/QR command for the next ^FD
    pending_barcode: tuple[str, str] | None = None

    # Second pass: render
    for cmd, params in tokens:
        try:
            if cmd == "LH":
                _handle_LH(state, params)
            elif cmd == "PW":
                pass  # Already handled
            elif cmd == "LL":
                pass  # Already handled
            elif cmd == "FO":
                _handle_FO(state, params)
            elif cmd == "FT":
                _handle_FT(state, params)
            elif cmd == "CF":
                _handle_CF(state, params)
            elif cmd in ("A0", "A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9"):
                _handle_A(state, params)
            elif len(cmd) == 2 and cmd[0] == "A" and cmd[1].isalpha():
                _handle_A(state, params)
            elif cmd == "FW":
                _handle_FW(state, params)
            elif cmd == "BY":
                _handle_BY(state, params)
            elif cmd == "FR":
                _handle_FR(state, params)
            elif cmd == "FB":
                _handle_FB(state, params)
            elif cmd == "CI":
                _handle_CI(state, params)
            elif cmd == "BC":
                pending_barcode = ("BC", params)
            elif cmd == "B3":
                pending_barcode = ("B3", params)
            elif cmd == "BQ":
                pending_barcode = ("BQ", params)
            elif cmd == "BE":
                pending_barcode = ("BE", params)
            elif cmd == "FD" or cmd == "FN":
                _handle_FD(state, params)
            elif cmd == "GB":
                _draw_graphic_box(draw, state, params)
            elif cmd == "GD":
                _draw_graphic_diagonal(draw, state, params)
            elif cmd == "GC":
                _draw_graphic_circle(draw, state, params)
            elif cmd == "GF":
                # Split params from data
                comma_count = 0
                split_idx = 0
                for idx, ch in enumerate(params):
                    if ch == ",":
                        comma_count += 1
                        if comma_count == 4:
                            split_idx = idx + 1
                            break
                if split_idx:
                    gf_params = params[:split_idx - 1]
                    gf_data = params[split_idx:]
                else:
                    gf_params = params
                    gf_data = ""
                _draw_graphic_field(image, state, gf_params, gf_data)
                draw = ImageDraw.Draw(image)  # Refresh draw after paste
            elif cmd == "FS":
                # Field separator — render pending field data
                if pending_barcode:
                    bc_cmd, bc_params = pending_barcode
                    if bc_cmd == "BC":
                        _draw_barcode_128(draw, state, bc_params)
                    elif bc_cmd == "B3":
                        _draw_barcode_39(draw, state, bc_params)
                    elif bc_cmd == "BQ":
                        _draw_qr_code(draw, image, state, bc_params)
                        draw = ImageDraw.Draw(image)
                    elif bc_cmd == "BE":
                        _draw_barcode_ean13(draw, state, bc_params)
                    pending_barcode = None
                elif state.field_data:
                    _draw_text(draw, state, state.field_data)

                # Reset field state
                state.field_data = ""
                state.field_reverse = False
                state.field_block = None
                state.current_font_h = 0
                state.current_font_w = 0
                state.field_typeset = False
            elif cmd in ("XA", "XZ"):
                pass  # Start/end markers
            else:
                logger.debug("Unsupported ZPL command: ^%s", cmd)
        except Exception as e:
            logger.debug("Error processing ^%s: %s", cmd, e)

    return image


def _extract_labels(zpl: str) -> list[str]:
    """Extract individual label blocks (^XA ... ^XZ) from ZPL text."""
    labels: list[str] = []
    pattern = re.compile(r"\^XA(.*?)\^XZ", re.DOTALL | re.IGNORECASE)
    for match in pattern.finditer(zpl):
        labels.append(match.group(0))
    if not labels:
        # If no ^XA/^XZ found, treat entire input as one label
        labels.append(zpl)
    return labels


def render_zpl(zpl: str, dpi: int = 203, width_dots: int | None = None) -> bytes:
    """
    Render ZPL text to a PNG image.

    Supports multiple labels (^XA...^XZ blocks) — they are stacked vertically.

    Args:
        zpl: Raw ZPL text.
        dpi: Printer DPI (default 203).
        width_dots: Override label width in dots.

    Returns:
        PNG image bytes.
    """
    labels = _extract_labels(zpl)
    images = [_render_single_label(label, dpi, width_dots) for label in labels]

    if len(images) == 1:
        result = images[0]
    else:
        # Stack vertically with 4-pixel gap
        gap = 4
        total_width = max(img.width for img in images)
        total_height = sum(img.height for img in images) + gap * (len(images) - 1)
        result = Image.new("L", (total_width, total_height), 200)  # light gray background
        y_offset = 0
        for img in images:
            result.paste(img, (0, y_offset))
            y_offset += img.height + gap

    buf = io.BytesIO()
    result.save(buf, format="PNG")
    return buf.getvalue()
