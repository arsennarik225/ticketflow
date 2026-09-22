"""QR images. Ticket QRs are plain black on white for reliable scanning from paper.
Campaign QRs sit in an orange frame labelled NOT A TICKET, so staff can tell them
apart at a glance (§4.14); the scanner also rejects them by content."""
import io

import qrcode
from PIL import Image, ImageDraw, ImageFont

ORANGE = (234, 88, 12)
DARK = (17, 24, 39)


def qr_image(data: str, box_size: int = 10) -> Image.Image:
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=box_size, border=4)
    qr.add_data(data)
    qr.make(fit=True)
    return qr.make_image(fill_color="black", back_color="white").get_image().convert("RGB")


def campaign_qr_png(url: str, code: str) -> bytes:
    code_img = qr_image(url)
    pad, caption = 36, 120
    width = code_img.width + 2 * pad
    canvas = Image.new("RGB", (width, code_img.height + 2 * pad + caption), ORANGE)
    canvas.paste(code_img, (pad, pad))
    draw = ImageDraw.Draw(canvas)
    lines = [
        ("PROMO CODE - NOT A TICKET", ImageFont.load_default(size=30)),
        (f"Code: {code}", ImageFont.load_default(size=26)),
        ("Scan to open the event page", ImageFont.load_default(size=20)),
    ]
    y = code_img.height + pad + 14
    for text, font in lines:
        x = (width - draw.textlength(text, font=font)) / 2
        draw.text((x, y), text, font=font, fill="white" if text.startswith("PROMO") else DARK)
        y += font.size + 10
    out = io.BytesIO()
    canvas.save(out, format="PNG")
    return out.getvalue()
