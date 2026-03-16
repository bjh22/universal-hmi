"""Tests for ZPL renderer."""

from app.services.zpl_renderer import render_zpl


class TestRenderZpl:
    """Test ZPL-to-PNG rendering."""

    def test_empty_label(self):
        """Empty ZPL produces a PNG image."""
        zpl = "^XA^XZ"
        img = render_zpl(zpl)
        assert isinstance(img, bytes)
        assert len(img) > 0
        # PNG magic bytes
        assert img[:4] == b'\x89PNG'

    def test_simple_text(self):
        """ZPL with a text field renders without error."""
        zpl = "^XA^FO50,50^A0N,40,40^FDHello World^FS^XZ"
        img = render_zpl(zpl)
        assert isinstance(img, bytes)
        assert len(img) > 0

    def test_custom_dpi(self):
        """DPI parameter affects image size."""
        zpl = "^XA^LL400^FO50,50^A0N,30,30^FDTest^FS^XZ"
        img_203 = render_zpl(zpl, dpi=203)
        img_300 = render_zpl(zpl, dpi=300)
        assert isinstance(img_203, bytes)
        assert isinstance(img_300, bytes)
        # Higher DPI produces larger PNG
        assert len(img_300) > len(img_203)

    def test_graphic_box(self):
        """ZPL with graphic box renders."""
        zpl = "^XA^FO50,50^GB200,100,3^FS^XZ"
        img = render_zpl(zpl)
        assert isinstance(img, bytes)
        assert len(img) > 0

    def test_barcode(self):
        """ZPL with barcode renders."""
        zpl = "^XA^FO50,50^BCN,100,Y,N,N^FD123456^FS^XZ"
        img = render_zpl(zpl)
        assert isinstance(img, bytes)
        assert len(img) > 0

    def test_label_size(self):
        """^LL command sets label length."""
        zpl = "^XA^LL400^FO10,10^A0N,30,30^FDTest^FS^XZ"
        img = render_zpl(zpl)
        assert isinstance(img, bytes)
        assert len(img) > 0

    def test_multiple_fields(self):
        """Multiple fields on same label."""
        zpl = """^XA
^FO50,50^A0N,30,30^FDLine 1^FS
^FO50,100^A0N,30,30^FDLine 2^FS
^FO50,150^A0N,30,30^FDLine 3^FS
^XZ"""
        img = render_zpl(zpl)
        assert isinstance(img, bytes)
        assert len(img) > 0

    def test_no_start_end_markers(self):
        """ZPL without ^XA/^XZ still renders."""
        zpl = "^FO50,50^A0N,30,30^FDNo markers^FS"
        img = render_zpl(zpl)
        assert isinstance(img, bytes)
        assert len(img) > 0
