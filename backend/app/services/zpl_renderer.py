"""
ZPL Renderer — Offline ZPL-to-PNG rendering using Pillow.

Parses ZPL II commands and renders them onto a bitmap image. Supports text,
barcodes (Code 128, Code 39), QR codes, graphic boxes, graphic fields, field
blocks, and common formatting commands.

Unsupported commands are silently skipped so partial renders always succeed.
"""

from __future__ import annotations

import base64
import io
import logging
import pathlib
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
    default_rotation: int = 0    # ^FW — persists across fields
    field_rotation: int = 0       # ^A — per-field override (0 = use default_rotation)
    field_rotation_set: bool = False  # True when ^A set rotation for this field
    font_width_explicit: bool = False  # True when ^A explicitly set a non-zero width
    label_reverse: bool = False   # ^LR — global reverse mode
    field_reverse: bool = False
    barcode_module_width: int = 2
    barcode_wide_ratio: float = 3.0
    barcode_height: int = 10
    encoding: int = 0             # ^CI value
    field_data: str = ""
    field_hex_indicator: str = ""  # ^FH — hex escape char (default '_')
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


_BUNDLED_FONT_DIR = pathlib.Path(__file__).parent / "fonts"

_FONT_SEARCH_PATHS = [
    # Zebra Font 0 is CG Triumvirate Condensed Bold — a condensed, bold,
    # sans-serif typeface.  We bundle the actual font for pixel-accurate
    # rendering that matches Labelary and real Zebra printers.
    _BUNDLED_FONT_DIR / "Triumvirate-CondensedBold.ttf",
    # Fallbacks (only reached if the primary font file is missing/corrupt)
    _BUNDLED_FONT_DIR / "LiberationSans-Bold.ttf",
    _BUNDLED_FONT_DIR / "LiberationSans-Regular.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/opentype/urw-base35/NimbusSans-Regular.otf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "arialbd.ttf",
]

# ZPL font height specifies the character cell height.  For the bundled
# CG Triumvirate Condensed Bold the Pillow em-square maps 1:1 to the ZPL
# height parameter, so we use pil_size = ZPL_height directly.
#
# When the ZPL ^A command specifies *both* height and width (e.g. ^A0,100,50),
# the width parameter controls horizontal character spacing independently.
# We use _FONT_CHAR_WIDTH_RATIO (average char width / em-square) to convert
# the ZPL width value into the correct Pillow font size for horizontal
# accuracy.  This is lazily computed from the resolved font.

_resolved_font_path: str | None = None
_font_resolution_done = False
_font_char_width_ratio: float = 0.0  # avg_char_width / pil_size


def _get_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    """Return a Pillow font at the requested pixel height."""
    global _resolved_font_path, _font_resolution_done, _font_char_width_ratio

    if not _font_resolution_done:
        for path in _FONT_SEARCH_PATHS:
            try:
                ImageFont.truetype(str(path), 20)
                _resolved_font_path = str(path)
                break
            except (OSError, IOError):
                continue
        # Compute the width ratio once for the resolved font.
        # ZPL width parameter controls horizontal scaling independently
        # from height.  We measure the font's average uppercase character
        # width and apply an empirical correction (×1.025) that compensates
        # for the slight glyph-width difference between the bundled
        # Triumvirate font and the original CG Triumvirate used by Zebra.
        if _resolved_font_path:
            _ref = ImageFont.truetype(_resolved_font_path, 100)
            _sample = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
            _raw_ratio = _ref.getlength(_sample) / len(_sample) / 100.0
            _font_char_width_ratio = _raw_ratio * 1.025
        _font_resolution_done = True

    if _resolved_font_path:
        try:
            return ImageFont.truetype(_resolved_font_path, max(size, 1))
        except (OSError, IOError):
            pass

    return ImageFont.load_default()


def _compute_font_size_and_xscale(
    font_h: int,
    font_w: int,
    width_explicit: bool = False,
) -> tuple[int, float]:
    """Determine Pillow font size and horizontal scale from ZPL parameters.

    Returns ``(pil_size, x_scale)`` where *pil_size* is based on the ZPL
    height parameter and *x_scale* is a horizontal compression factor
    (1.0 = no compression) derived from the ZPL width parameter.

    On a real Zebra, ``^A0,100,50`` renders Font 0 at 100-dot height and
    independently compresses horizontally so characters are 50 dots wide.
    We emulate this by rendering at the height-based size and multiplying
    measured text widths by *x_scale* for word-wrap and positioning.
    """
    h = font_h or 15

    if width_explicit and font_w > 0 and h > 0 and _font_char_width_ratio > 0:
        # Only compress when width < height (e.g. ^A0,100,50).
        # When w >= h (e.g. ^A0,40,40), the font renders at its natural
        # condensed proportions — no scaling needed.
        if font_w < h:
            natural_w = h * _font_char_width_ratio
            if natural_w > 0:
                x_scale = font_w / natural_w
                x_scale = max(0.3, min(x_scale, 1.0))
                return (max(h, 8), x_scale)

    return (max(h, 8), 1.0)


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


def _handle_A(state: _LabelState, cmd: str, params: str) -> None:
    """^Af[o[,h[,w]]] — font selection for current field.

    The font name is the second character of the command (e.g. ^A0, ^AA).
    params contains the rotation and optional height/width.

    Examples:
      ^A0B,33   → cmd="A0", params="B,33"  → font="0", rotation=B, h=33
      ^A0,60,0  → cmd="A0", params=",60,0" → font="0", rotation=N, h=60, w=0
      ^A0N,33,0 → cmd="A0", params="N,33,0"→ font="0", rotation=N, h=33, w=0
    """
    font_name = cmd[1] if len(cmd) >= 2 else "0"

    rotation = "N"
    height = 0
    width = 0
    if params:
        # Check if first char is a rotation letter (N/R/I/B)
        rot_char = params[0]
        if rot_char in _ROTATION_MAP:
            rotation = rot_char
            rest = params[1:].lstrip(",")  # strip the comma after rotation
        else:
            # No rotation char — params is ",h,w" or "h,w"
            rest = params.lstrip(",")
        parts = _split_params(rest)
        if len(parts) >= 1 and parts[0].strip():
            height = _parse_int(parts[0])
        if len(parts) >= 2 and parts[1].strip():
            width = _parse_int(parts[1])

    state.current_font = font_name
    state.current_font_h = height
    state.current_font_w = width
    state.font_width_explicit = width > 0
    if rotation in _ROTATION_MAP:
        state.field_rotation = _ROTATION_MAP[rotation]
        state.field_rotation_set = True


def _handle_FW(state: _LabelState, params: str) -> None:
    if params.strip() and params.strip()[0] in _ROTATION_MAP:
        state.default_rotation = _ROTATION_MAP[params.strip()[0]]


def _handle_BY(state: _LabelState, params: str) -> None:
    parts = _split_params(params)
    if len(parts) >= 1 and parts[0].strip():
        state.barcode_module_width = _parse_int(parts[0], state.barcode_module_width)
    if len(parts) >= 2 and parts[1].strip():
        state.barcode_wide_ratio = _parse_float(parts[1], state.barcode_wide_ratio)
    if len(parts) >= 3 and parts[2].strip():
        state.barcode_height = _parse_int(parts[2], state.barcode_height)


def _handle_FH(state: _LabelState, params: str) -> None:
    """^FH — set field hex indicator character (default '_')."""
    state.field_hex_indicator = params.strip() if params.strip() else "_"


def _decode_field_hex(data: str, indicator: str) -> str:
    """Replace hex escape sequences in field data.

    e.g. with indicator '_': '_2D' → '-', '_41' → 'A'.
    """
    result: list[str] = []
    i = 0
    while i < len(data):
        if data[i] == indicator and i + 2 < len(data):
            hex_str = data[i + 1:i + 3]
            try:
                result.append(chr(int(hex_str, 16)))
                i += 3
                continue
            except ValueError:
                pass
        result.append(data[i])
        i += 1
    return "".join(result)


def _handle_FD(state: _LabelState, params: str) -> None:
    data = params
    if state.field_hex_indicator:
        data = _decode_field_hex(data, state.field_hex_indicator)
    state.field_data = data


def _handle_FR(state: _LabelState, _params: str) -> None:
    state.field_reverse = True


def _handle_LR(state: _LabelState, params: str) -> None:
    """^LR — Label Reverse. Y = all subsequent fields render in reverse."""
    val = params.strip().upper()
    state.label_reverse = val.startswith("Y")


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
    image: Image.Image,
    state: _LabelState,
    text: str,
) -> ImageDraw.ImageDraw:
    """Draw a text field at the current field origin.

    Returns the (possibly refreshed) ImageDraw instance.  When field_reverse
    is active the text is XOR-composited onto *image* directly, so the caller
    must use the returned draw object for subsequent operations.
    """
    font_h = state.current_font_h or state.default_font_h
    font_w = state.current_font_w or state.default_font_w
    font_size, x_scale = _compute_font_size_and_xscale(
        font_h, font_w, state.font_width_explicit
    )
    font = _get_font(font_size)

    x = state.label_home_x + state.field_origin_x
    y = state.label_home_y + state.field_origin_y
    rotation = state.field_rotation if state.field_rotation_set else state.default_rotation

    if state.field_reverse or state.label_reverse:
        if state.field_block:
            _draw_field_block_reverse(image, state, text, font, x, y, rotation, x_scale)
        else:
            _draw_text_reverse(image, state, text, font, x, y, rotation, x_scale)
        return ImageDraw.Draw(image)

    fill = 0

    if state.field_block and rotation:
        # Rotated field block: render then rotate
        tmp, tw, th, ox, oy = _render_text_to_image(text, font)
        if x_scale != 1.0:
            tmp = tmp.resize((max(int(tmp.width * x_scale), 1), tmp.height), Image.LANCZOS)
        tmp = _apply_rotation(tmp, rotation)
        mask = tmp.point(lambda p: 255 if p < 128 else 0)
        draw.bitmap((x, y), mask, fill=0)
    elif state.field_block:
        _draw_field_block(draw, image, state, text, font, x, y, fill, x_scale)
    elif rotation:
        # Rotated text: render to temp image, rotate, paste
        tmp, tw, th, ox, oy = _render_text_to_image(text, font)
        tmp = _apply_rotation(tmp, rotation)
        # Make rotated text black-on-transparent for pasting
        mask = tmp.point(lambda p: 255 if p < 128 else 0)
        if state.field_typeset:
            bbox = font.getbbox(text)
            text_height = (bbox[3] - bbox[1]) if bbox else font_size
            draw.bitmap((x, y - text_height), mask, fill=0)
        else:
            draw.bitmap((x, y), mask, fill=0)
    elif state.field_typeset:
        # ^FT positions the baseline, not the top
        bbox = font.getbbox(text)
        text_height = bbox[3] - bbox[1] if bbox else font_size
        draw.text((x, y - text_height), text, fill=fill, font=font)
    else:
        draw.text((x, y), text, fill=fill, font=font)
    return draw


def _xor_paste_text(
    image: Image.Image,
    text_img: Image.Image,
    x: int,
    y: int,
) -> None:
    """XOR-composite a rendered text image onto the label canvas.

    Where the text glyph pixels are dark (< 128), the canvas pixel is
    inverted.  This matches ZPL ^FR behaviour: text on a black box becomes
    white, text on a white background becomes black.
    """
    # Clip to image bounds
    paste_x = max(x, 0)
    paste_y = max(y, 0)
    crop_left = paste_x - x
    crop_top = paste_y - y
    crop_right = min(text_img.width, image.width - paste_x) + crop_left
    crop_bottom = min(text_img.height, image.height - paste_y) + crop_top

    if crop_right <= crop_left or crop_bottom <= crop_top:
        return

    text_crop = text_img.crop((crop_left, crop_top, crop_right, crop_bottom))
    canvas_region = image.crop((paste_x, paste_y, paste_x + text_crop.width, paste_y + text_crop.height))

    # XOR: where the text glyph is dark (< 128), invert the canvas pixel.
    # Build a mask from the text image (white where glyph, black where not).
    from PIL import ImageChops
    # Threshold: glyph pixels (< 128) → 0, background → 255
    glyph_mask = text_crop.point(lambda p: 0 if p < 128 else 255)
    # Invert entire canvas region
    inverted = ImageChops.invert(canvas_region)
    # Composite: where glyph_mask is 0 (glyph present), use inverted; else keep original
    # PIL composite: composite(image1, image2, mask) — mask 255 = image1, mask 0 = image2
    result = Image.composite(canvas_region, inverted, glyph_mask)
    image.paste(result, (paste_x, paste_y))


def _render_text_to_image(
    text: str,
    font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
) -> tuple[Image.Image, int, int, int, int]:
    """Render text as black on white into a temp image.

    Returns (image, text_width, text_height, offset_x, offset_y).
    """
    bbox = font.getbbox(text)
    tw = (bbox[2] - bbox[0]) if bbox else len(text) * 10
    th = (bbox[3] - bbox[1]) if bbox else 20
    tw += 4
    th += 4
    tmp = Image.new("L", (tw, th), 255)
    tmp_draw = ImageDraw.Draw(tmp)
    ox = -(bbox[0]) if bbox else 0
    oy = -(bbox[1]) if bbox else 0
    tmp_draw.text((ox, oy), text, fill=0, font=font)
    return tmp, tw, th, ox, oy


def _apply_rotation(img: Image.Image, rotation: int) -> Image.Image:
    """Rotate a text image per ZPL rotation conventions.

    ZPL rotation: N=0°, R=90° clockwise, I=180°, B=270° clockwise (= 90° CCW).
    Pillow transpose: ROTATE_90 = 90° CCW, ROTATE_270 = 90° CW.
    """
    if rotation == 90:   # R — 90° clockwise
        return img.transpose(Image.ROTATE_270)
    if rotation == 180:  # I — 180°
        return img.transpose(Image.ROTATE_180)
    if rotation == 270:  # B — 270° clockwise = 90° CCW
        return img.transpose(Image.ROTATE_90)
    return img


def _draw_text_reverse(
    image: Image.Image,
    state: _LabelState,
    text: str,
    font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
    x: int,
    y: int,
    rotation: int = 0,
    x_scale: float = 1.0,
) -> None:
    """Render text with ^FR (field reverse / XOR) for a single-line field."""
    tmp, tw, th, ox, oy = _render_text_to_image(text, font)

    if x_scale != 1.0:
        new_w = max(int(tmp.width * x_scale), 1)
        tmp = tmp.resize((new_w, tmp.height), Image.LANCZOS)

    if rotation:
        tmp = _apply_rotation(tmp, rotation)

    if state.field_typeset:
        bbox = font.getbbox(text)
        text_height = (bbox[3] - bbox[1]) if bbox else th
        _xor_paste_text(image, tmp, x, y - text_height)
    else:
        _xor_paste_text(image, tmp, x, y)


def _draw_field_block_reverse(
    image: Image.Image,
    state: _LabelState,
    text: str,
    font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
    x: int,
    y: int,
    rotation: int = 0,
    x_scale: float = 1.0,
) -> None:
    """Render ^FB + ^FR text with XOR compositing."""
    if not state.field_block:
        return
    block_width, max_lines, line_spacing, justification = state.field_block

    # Word-wrap using effective (compressed) widths
    words = text.split()
    lines: list[str] = []
    current_line = ""
    for word in words:
        test = f"{current_line} {word}".strip()
        bbox = font.getbbox(test)
        tw = bbox[2] - bbox[0] if bbox else len(test) * 8
        effective_tw = tw * x_scale
        if effective_tw > block_width and current_line:
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
        bbox = font.getbbox(line)
        tw = bbox[2] - bbox[0] if bbox else len(line) * 8
        effective_tw = tw * x_scale

        if justification == "C":
            lx = x + (block_width - int(effective_tw)) // 2
        elif justification == "R":
            lx = x + block_width - int(effective_tw)
        else:
            lx = x

        # Render this line with XOR
        th = (bbox[3] - bbox[1]) if bbox else font_h
        tmp = Image.new("L", (tw + 4, th + 4), 255)
        tmp_draw = ImageDraw.Draw(tmp)
        ox = -(bbox[0]) if bbox else 0
        oy = -(bbox[1]) if bbox else 0
        tmp_draw.text((ox, oy), line, fill=0, font=font)
        if x_scale != 1.0:
            new_w = max(int(tmp.width * x_scale), 1)
            tmp = tmp.resize((new_w, tmp.height), Image.LANCZOS)
        if rotation:
            tmp = _apply_rotation(tmp, rotation)
        _xor_paste_text(image, tmp, lx, ly)


def _draw_field_block(
    draw: ImageDraw.ImageDraw,
    image: Image.Image,
    state: _LabelState,
    text: str,
    font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
    x: int,
    y: int,
    fill: int,
    x_scale: float = 1.0,
) -> None:
    """Draw text with word wrapping (^FB).

    When *x_scale* < 1.0, text is rendered to a temporary image and
    horizontally compressed before pasting — this emulates ZPL's
    independent width scaling (e.g. ``^A0,100,50``).
    """
    if not state.field_block:
        return
    block_width, max_lines, line_spacing, justification = state.field_block

    # Word-wrap using effective (compressed) text widths
    words = text.split()
    lines: list[str] = []
    current_line = ""
    for word in words:
        test = f"{current_line} {word}".strip()
        bbox = font.getbbox(test)
        tw = bbox[2] - bbox[0] if bbox else len(test) * 8
        effective_tw = tw * x_scale
        if effective_tw > block_width and current_line:
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
        # Measure natural width, then compute effective (scaled) width
        bbox = font.getbbox(line)
        tw = bbox[2] - bbox[0] if bbox else len(line) * 8
        effective_tw = tw * x_scale

        # Justification uses effective width
        if justification == "C":
            lx = x + (block_width - int(effective_tw)) // 2
        elif justification == "R":
            lx = x + block_width - int(effective_tw)
        else:
            lx = x

        if x_scale != 1.0:
            # Render to temp image, compress horizontally, paste
            th = (bbox[3] - bbox[1]) if bbox else font_h
            tmp = Image.new("L", (tw + 4, th + 4), 255)
            tmp_draw = ImageDraw.Draw(tmp)
            ox = -(bbox[0]) if bbox else 0
            oy = -(bbox[1]) if bbox else 0
            tmp_draw.text((ox, oy), line, fill=0, font=font)
            new_w = max(int(tmp.width * x_scale), 1)
            tmp = tmp.resize((new_w, tmp.height), Image.LANCZOS)
            # Paste using mask (black text on white background)
            mask = tmp.point(lambda p: 255 if p < 128 else 0)
            draw.bitmap((lx, ly), mask, fill=fill)
        else:
            draw.text((lx, ly), line, fill=fill, font=font)


def _draw_box_to_image(
    w: int,
    h: int,
    thickness: int,
    corner_rounding: int,
    fill_color: int,
) -> Image.Image:
    """Render a box to a temporary image (for XOR compositing).

    Uses mode '1' (binary) to avoid anti-aliasing on rounded corners,
    then converts to 'L' for compositing.
    """
    bin_color = 0 if fill_color == 0 else 1
    bin_bg = 1 if fill_color == 0 else 0
    tmp_bin = Image.new("1", (w + 1, h + 1), bin_bg)
    tmp_draw = ImageDraw.Draw(tmp_bin)
    # Treat as filled when thickness covers the interior
    is_filled = thickness >= w or thickness >= h or thickness * 2 >= min(w, h)
    if is_filled:
        if corner_rounding > 0:
            r = min(corner_rounding * min(w, h) // 16, min(w, h) // 2)
            tmp_draw.rounded_rectangle([0, 0, w, h], radius=r, fill=bin_color)
        else:
            tmp_draw.rectangle([0, 0, w, h], fill=bin_color)
    else:
        if corner_rounding > 0:
            r = min(corner_rounding * min(w, h) // 16, min(w, h) // 2)
            for t in range(thickness):
                if w - t <= t or h - t <= t:
                    break
                tmp_draw.rounded_rectangle(
                    [t, t, w - t, h - t],
                    radius=max(r - t, 0),
                    outline=bin_color,
                )
        else:
            for t in range(thickness):
                if w - t <= t or h - t <= t:
                    break
                tmp_draw.rectangle(
                    [t, t, w - t, h - t],
                    outline=bin_color,
                )
    return tmp_bin.convert("L")


def _draw_graphic_box(
    draw: ImageDraw.ImageDraw,
    image: Image.Image,
    state: _LabelState,
    params: str,
) -> ImageDraw.ImageDraw:
    """^GB — draw a rectangle/line. Returns (possibly refreshed) draw."""
    parts = _split_params(params)
    w = _parse_int(parts[0], 1) if len(parts) >= 1 else 1
    h = _parse_int(parts[1], 1) if len(parts) >= 2 else 1
    thickness = _parse_int(parts[2], 1) if len(parts) >= 3 else 1
    color = parts[3].strip() if len(parts) >= 4 and parts[3].strip() else "B"
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

    if state.label_reverse:
        # XOR compositing: render to temp image, then XOR onto canvas
        tmp = _draw_box_to_image(w, h, thickness, corner_rounding, 0)
        _xor_paste_text(image, tmp, x, y)
        return ImageDraw.Draw(image)

    # Normal rendering — treat as filled when thickness covers the interior
    is_filled = thickness >= w or thickness >= h or thickness * 2 >= min(w, h)
    if is_filled:
        if corner_rounding > 0:
            r = min(corner_rounding * min(w, h) // 16, min(w, h) // 2)
            # Render box in binary mode to avoid anti-aliased corners
            tmp = Image.new("1", (w + 1, h + 1), 1 if fill_color == 255 else 0)
            tmp_draw = ImageDraw.Draw(tmp)
            tmp_draw.rounded_rectangle(
                [0, 0, w, h], radius=r,
                fill=0 if fill_color == 0 else 1,
            )
            image.paste(tmp.convert("L"), (x, y))
            return ImageDraw.Draw(image)
        else:
            draw.rectangle([x, y, x + w, y + h], fill=fill_color)
    else:
        if corner_rounding > 0:
            r = min(corner_rounding * min(w, h) // 16, min(w, h) // 2)
            # Render in binary mode to avoid anti-aliased corners
            tmp = Image.new("1", (w + 1, h + 1), 1 if fill_color == 255 else 0)
            tmp_draw = ImageDraw.Draw(tmp)
            for t in range(thickness):
                if w - 2 * t <= 0 or h - 2 * t <= 0:
                    break
                tmp_draw.rounded_rectangle(
                    [t, t, w - t, h - t],
                    radius=max(r - t, 0),
                    outline=0 if fill_color == 0 else 1,
                )
            image.paste(tmp.convert("L"), (x, y))
            return ImageDraw.Draw(image)
        else:
            for t in range(thickness):
                if w - 2 * t <= 0 or h - 2 * t <= 0:
                    break
                draw.rectangle(
                    [x + t, y + t, x + w - t, y + h - t],
                    outline=fill_color,
                )
    return draw


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
    if state.field_reverse:
        fill_color = 255 if fill_color == 0 else 0

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
    if state.field_reverse:
        fill_color = 255 if fill_color == 0 else 0

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

    # Decode data
    raw = field_data.replace("\n", "").replace("\r", "").replace(" ", "")

    # Check for :Z64: (base64+zlib compressed) or :B64: (base64 only) prefix
    if raw.startswith(":Z64:") or raw.startswith(":z64:"):
        b64_data = raw[5:]
        # Strip trailing CRC (":XXXX" at the end)
        if ":" in b64_data:
            b64_data = b64_data[:b64_data.rindex(":")]
        try:
            compressed = base64.b64decode(b64_data)
            pixel_data = zlib.decompress(compressed)
        except Exception as e:
            logger.debug("Failed to decode :Z64: graphic: %s", e)
            return
    elif raw.startswith(":B64:") or raw.startswith(":b64:"):
        b64_data = raw[5:]
        if ":" in b64_data:
            b64_data = b64_data[:b64_data.rindex(":")]
        try:
            pixel_data = base64.b64decode(b64_data)
        except Exception as e:
            logger.debug("Failed to decode :B64: graphic: %s", e)
            return
    elif fmt == "A":
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


def _render_barcode_image(
    barcode_type: str,
    data: str,
    module: int,
    height: int,
) -> Image.Image:
    """Render a barcode using python-barcode and scale to ZPL dimensions.

    Returns a greyscale Image cropped and scaled to the correct dot size.
    """
    import barcode as barcode_lib
    from barcode.writer import ImageWriter

    writer = ImageWriter()

    if barcode_type == "code128":
        # Use Code 128B to match ZPL printer behavior (one symbol per char).
        # python-barcode auto-optimises to Code 128C for numeric data, which
        # produces a narrower barcode than a real Zebra printer.
        from barcode.codex import Code128
        import barcode.charsets.code128 as _c128

        class _Code128B(Code128):
            """Code 128 forced to subset B (no C optimisation)."""
            def _build(self):
                encoded = [_c128.START_CODES["B"]]
                for char in self.code:
                    code_num = _c128.B.get(char)
                    if code_num is not None:
                        encoded.append(code_num)
                return encoded

            def _try_to_optimize(self, encoded):
                return encoded

        code = _Code128B(data, writer=writer)
    else:
        code = barcode_lib.get(barcode_type, data, writer=writer)

    # Get the bar pattern to determine the true module count
    bars = code.build()
    pattern = bars[0] if isinstance(bars, list) else str(bars)
    total_modules = len(pattern)

    buf = io.BytesIO()
    # Options must be passed to write() — set_options() is ignored by some versions
    code.write(buf, options={
        "write_text": False,
        "quiet_zone": 0,
    })
    buf.seek(0)
    bc_img = Image.open(buf).convert("L")

    # Scale: the target width = total_modules * module_width_dots
    target_w = total_modules * module
    target_h = height
    return bc_img.resize((target_w, target_h), Image.NEAREST)


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
        # Strip Code 128 subset prefixes
        data = text
        if data.startswith((">:", ">9", ">5", ">6")):
            data = data[2:]

        bc_img = _render_barcode_image("code128", data, module, height)
        target_w = bc_img.width

        # Human-readable text
        hr_img = None
        if print_text == "Y":
            hr_font_size = max(module * 10, 14)
            font = _get_font(hr_font_size)
            hr_img, hr_tw, hr_th, hr_ox, hr_oy = _render_text_to_image(text, font)

        # Apply rotation
        rot = _ROTATION_MAP.get(orientation, 0)
        if rot:
            bc_img_l = bc_img.convert("L")
            bc_img_l = _apply_rotation(bc_img_l, rot)
            mask = bc_img_l.point(lambda p: 255 if p < 128 else 0)
            draw.bitmap((x, y), mask, fill=0)
            # Position human-readable text for rotated barcodes
            if hr_img is not None:
                hr_img = _apply_rotation(hr_img, rot)
                hr_mask = hr_img.point(lambda p: 255 if p < 128 else 0)
                if rot == 270:  # B — bottom-up
                    text_x = x + bc_img_l.width + 4 if text_above != "Y" else x - hr_img.width - 4
                    text_y = y + (bc_img_l.height - hr_img.height) // 2
                elif rot == 90:  # R — 90° CW
                    text_x = x + (bc_img_l.width - hr_img.width) // 2
                    text_y = y + bc_img_l.height + 4 if text_above != "Y" else y - hr_img.height - 4
                else:  # 180 — inverted
                    text_x = x + (bc_img_l.width - hr_img.width) // 2
                    text_y = y - hr_img.height - 4 if text_above != "Y" else y + bc_img_l.height + 4
                draw.bitmap((text_x, text_y), hr_mask, fill=0)
        else:
            # No rotation — paste normally
            mask = bc_img.point(lambda p: 255 if p < 128 else 0)
            draw.bitmap((x, y), mask, fill=0)
            if hr_img is not None:
                hr_mask = hr_img.point(lambda p: 255 if p < 128 else 0)
                text_x = x + (target_w - hr_img.width) // 2
                text_y = y + height + 4 if text_above != "Y" else y - hr_img.height - 4
                draw.bitmap((text_x, text_y), hr_mask, fill=0)

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
        bc_img = _render_barcode_image("code39", text, module, height)
        target_w = bc_img.width

        mask = bc_img.point(lambda p: 255 if p < 128 else 0)
        draw.bitmap((x, y), mask, fill=0)

        if print_text == "Y":
            hr_font_size = max(module * 10, 14)
            font = _get_font(hr_font_size)
            bbox = font.getbbox(text)
            tw = bbox[2] - bbox[0] if bbox else len(text) * 8
            text_x = x + (target_w - tw) // 2
            text_y = y + height + 4 if text_above != "Y" else y - hr_font_size - 4
            draw.text((text_x, text_y), text, fill=0, font=font)

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
        # ^FT positions the baseline (bottom) of the element
        if state.field_typeset:
            y = y - qr_img.height
        image.paste(qr_img, (x, y))
    except ImportError:
        size = magnification * 21
        draw.rectangle([x, y, x + size, y + size], outline=0)
        font = _get_font(10)
        draw.text((x + 2, y + 2), "[QR]", fill=0, font=font)
    except Exception as e:
        logger.debug("QR code rendering error: %s", e)


def _draw_data_matrix(
    draw: ImageDraw.ImageDraw,
    image: Image.Image,
    state: _LabelState,
    params: str,
) -> None:
    """^BX — Data Matrix barcode."""
    parts = _split_params(params)
    orientation = parts[0].strip() if len(parts) >= 1 and parts[0].strip() else "N"
    height = _parse_int(parts[1], 10) if len(parts) >= 2 and parts[1].strip() else 10
    quality = _parse_int(parts[2], 200) if len(parts) >= 3 and parts[2].strip() else 200

    text = state.field_data
    if not text:
        return

    x = state.label_home_x + state.field_origin_x
    y = state.label_home_y + state.field_origin_y

    dm_img: Image.Image | None = None

    # Try pylibdmtx first (best quality)
    try:
        from pylibdmtx.pylibdmtx import encode as dmtx_encode

        encoded = dmtx_encode(text.encode("utf-8"))
        dm_img = Image.frombytes("RGB", (encoded.width, encoded.height), encoded.pixels)
        dm_img = dm_img.convert("L")
        # pylibdmtx returns ~5px per module; scale to requested module size
        raw_modules = dm_img.width
        if raw_modules > 0:
            scale = max(1, height * 10 // raw_modules)
            target_w = dm_img.width * scale // 5
            target_h = dm_img.height * scale // 5
        else:
            target_w = height * 10
            target_h = height * 10
        dm_img = dm_img.resize((target_w, target_h), Image.NEAREST)
    except ImportError:
        pass
    except Exception as e:
        logger.debug("pylibdmtx Data Matrix error: %s", e)

    # Fallback: try segno
    if dm_img is None:
        try:
            import segno
            dm = segno.make(text, micro=False)
            buf = io.BytesIO()
            dm.save(buf, kind="png", scale=height, border=0)
            buf.seek(0)
            dm_img = Image.open(buf).convert("L")
        except ImportError:
            pass
        except Exception as e:
            logger.debug("segno Data Matrix error: %s", e)

    # Fallback: pure-Pillow placeholder with data hash pattern
    if dm_img is None:
        dm_img = _generate_data_matrix_placeholder(text, height)

    # Apply rotation
    rot = _ROTATION_MAP.get(orientation, 0)
    if rot == 90:
        dm_img = dm_img.transpose(Image.ROTATE_270)
    elif rot == 180:
        dm_img = dm_img.transpose(Image.ROTATE_180)
    elif rot == 270:
        dm_img = dm_img.transpose(Image.ROTATE_90)

    image.paste(dm_img, (x, y))


def _generate_data_matrix_placeholder(data: str, module_size: int) -> Image.Image:
    """Generate a Data Matrix-like placeholder using data hash.

    Creates a deterministic pattern that looks like a Data Matrix barcode,
    with the characteristic L-shaped finder pattern and alternating clock track.
    Not scannable, but visually representative for preview purposes.
    """
    import hashlib

    # Data Matrix sizes: pick based on data length
    data_len = len(data)
    if data_len <= 6:
        matrix_size = 10
    elif data_len <= 16:
        matrix_size = 14
    elif data_len <= 30:
        matrix_size = 18
    else:
        matrix_size = 22

    # Create the module grid
    grid = [[False] * matrix_size for _ in range(matrix_size)]

    # L-shaped finder pattern: solid left column and solid bottom row
    for r in range(matrix_size):
        grid[r][0] = True  # left column solid
    for c in range(matrix_size):
        grid[matrix_size - 1][c] = True  # bottom row solid

    # Clock track: alternating top row and right column
    for c in range(matrix_size):
        grid[0][c] = (c % 2 == 0)  # top row alternating
    for r in range(matrix_size):
        grid[r][matrix_size - 1] = (r % 2 == 0)  # right column alternating

    # Fill interior with hash-based pattern
    digest = hashlib.sha256(data.encode("utf-8")).digest()
    bit_idx = 0
    for r in range(1, matrix_size - 1):
        for c in range(1, matrix_size - 1):
            byte_idx = bit_idx // 8
            bit_pos = bit_idx % 8
            if byte_idx < len(digest):
                grid[r][c] = bool(digest[byte_idx] & (1 << bit_pos))
            bit_idx += 1

    # Render to image
    img_size = matrix_size * module_size
    img = Image.new("L", (img_size, img_size), 255)
    draw_dm = ImageDraw.Draw(img)
    for r in range(matrix_size):
        for c in range(matrix_size):
            if grid[r][c]:
                x0 = c * module_size
                y0 = r * module_size
                draw_dm.rectangle([x0, y0, x0 + module_size - 1, y0 + module_size - 1], fill=0)
    return img


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
        bc_img = _render_barcode_image("ean13", text[:12], module, height)
        target_w = bc_img.width
        mask = bc_img.point(lambda p: 255 if p < 128 else 0)
        draw.bitmap((x, y), mask, fill=0)
        if print_text == "Y":
            hr_font_size = max(module * 10, 14)
            font = _get_font(hr_font_size)
            bbox = font.getbbox(text)
            tw = bbox[2] - bbox[0] if bbox else len(text) * 8
            text_x = x + (target_w - tw) // 2
            draw.text((text_x, y + height + 4), text, fill=0, font=font)
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

    # First pass: scan for ^PW, ^LL, and auto-detect dimensions from content
    tokens = _tokenize_zpl(zpl)
    has_pw = False
    has_ll = False
    max_x = 0
    max_y = 0
    scan_fo_x = 0
    scan_fo_y = 0
    for cmd, params in tokens:
        if cmd == "PW":
            _handle_PW(state, params)
            has_pw = True
        elif cmd == "LL":
            _handle_LL(state, params)
            has_ll = True
        elif cmd == "FO":
            parts = _split_params(params)
            scan_fo_x = _parse_int(parts[0]) if len(parts) >= 1 else 0
            scan_fo_y = _parse_int(parts[1]) if len(parts) >= 2 else 0
            max_x = max(max_x, scan_fo_x)
            max_y = max(max_y, scan_fo_y)
        elif cmd == "FT":
            parts = _split_params(params)
            if len(parts) >= 1 and parts[0].strip():
                scan_fo_x = _parse_int(parts[0])
            if len(parts) >= 2 and parts[1].strip():
                scan_fo_y = _parse_int(parts[1])
            max_x = max(max_x, scan_fo_x)
            max_y = max(max_y, scan_fo_y)
        elif cmd == "GB":
            parts = _split_params(params)
            gb_w = _parse_int(parts[0], 1) if len(parts) >= 1 else 1
            gb_h = _parse_int(parts[1], 1) if len(parts) >= 2 else 1
            max_x = max(max_x, scan_fo_x + gb_w)
            max_y = max(max_y, scan_fo_y + gb_h)

    # If no explicit ^PW/^LL, expand to fit content (with margin)
    if not has_pw and max_x > state.label_width:
        state.label_width = max_x + 10
    if not has_ll and max_y > state.label_height:
        state.label_height = max_y + 10

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
                _handle_A(state, cmd, params)
            elif len(cmd) == 2 and cmd[0] == "A" and cmd[1].isalpha():
                _handle_A(state, cmd, params)
            elif cmd == "FW":
                _handle_FW(state, params)
            elif cmd == "BY":
                _handle_BY(state, params)
            elif cmd == "FH":
                _handle_FH(state, params)
            elif cmd == "FR":
                _handle_FR(state, params)
            elif cmd == "LR":
                _handle_LR(state, params)
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
            elif cmd == "BX":
                pending_barcode = ("BX", params)
            elif cmd == "BE":
                pending_barcode = ("BE", params)
            elif cmd == "FD" or cmd == "FN":
                _handle_FD(state, params)
            elif cmd == "GB":
                draw = _draw_graphic_box(draw, image, state, params)
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
                    elif bc_cmd == "BX":
                        _draw_data_matrix(draw, image, state, bc_params)
                        draw = ImageDraw.Draw(image)
                    elif bc_cmd == "BE":
                        _draw_barcode_ean13(draw, state, bc_params)
                    pending_barcode = None
                elif state.field_data:
                    draw = _draw_text(draw, image, state, state.field_data)

                # Reset field state
                state.field_data = ""
                state.field_reverse = False
                state.field_block = None
                state.current_font_h = 0
                state.current_font_w = 0
                state.field_typeset = False
                state.field_rotation = 0
                state.field_rotation_set = False
                state.font_width_explicit = False
                state.field_hex_indicator = ""
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

    # Filter out empty labels (e.g. ^XA^MCY^XZ calibration blocks)
    _NON_RENDER_CMDS = {"XA", "XZ", "MC", "PQ", "PF", "PM", "PO", "PP", "PR", "JU", "JM", "JB", "JF", "JJ", "JS", "JZ", "MN", "MT", "MD", "MU", "MM", "CT", "CD"}
    filtered_labels: list[str] = []
    for label in labels:
        tokens = _tokenize_zpl(label)
        has_renderable = any(cmd not in _NON_RENDER_CMDS for cmd, _ in tokens)
        if has_renderable:
            filtered_labels.append(label)
    if not filtered_labels:
        filtered_labels = labels[:1]  # Always render at least one label
    labels = filtered_labels

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
