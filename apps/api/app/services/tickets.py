"""Ticket and order numbers, and the printable PDF (§4.7).

The PDF is drawn from the ticket row itself, so the paper copy and the phone copy carry
the same ticket number and the same signed QR payload: one ticket, one admission."""
import os

from fpdf import FPDF

from app.config import settings
from app.formatting import local_time
from app.models import Ticket
from app.security import random_code, ticket_qr_payload
from app.services import messages
from app.services.qr import qr_image

# Fonts with Cyrillic glyphs (Kazakh and Russian names). The Docker image ships DejaVu;
# the others cover local runs on macOS and Windows.
FONT_CANDIDATES = [
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    ("/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
    ("C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/arialbd.ttf"),
]


def new_ticket_number() -> str:
    return f"TKT-{random_code(4)}-{random_code(4)}"


def new_order_number() -> str:
    return f"ORD-{random_code(8)}"


def _fonts(pdf: FPDF) -> str:
    candidates = [(settings.pdf_font, settings.pdf_font)] if settings.pdf_font else []
    for regular, bold in candidates + FONT_CANDIDATES:
        if os.path.exists(regular):
            pdf.add_font("Body", "", regular)
            pdf.add_font("Body", "B", bold if os.path.exists(bold) else regular)
            return "Body"
    return "Helvetica"  # Latin-1 only; other characters print as '?'


def ticket_pdf(ticket: Ticket) -> bytes:
    event, ticket_type, language = ticket.event, ticket.ticket_type, ticket.order.language
    labels = messages.pdf_labels(language)
    pdf = FPDF(format="A4")
    pdf.set_margins(15, 15, 15)
    pdf.set_auto_page_break(False)
    pdf.add_page()
    family = _fonts(pdf)

    def text(value: str) -> str:
        return value if family != "Helvetica" else value.encode("latin-1", "replace").decode("latin-1")

    def line(size: int, value: str, style: str = "", gap: float = 2) -> None:
        pdf.set_font(family, style, size)
        pdf.multi_cell(0, size * 0.5, text(value), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(gap)

    pdf.set_fill_color(17, 24, 39)
    pdf.rect(0, 0, 210, 24, style="F")
    pdf.set_text_color(255, 255, 255)
    pdf.set_xy(15, 8)
    pdf.set_font(family, "B", 16)
    pdf.cell(0, 8, text(f"BiletFlow  |  {labels['title']}"))
    pdf.set_text_color(0, 0, 0)
    pdf.set_xy(15, 34)

    line(22, event.title, "B", 4)
    line(12, f"{labels['starts']}: {local_time(event.starts_at, event.time_zone)}")
    line(12, f"{labels['ends']}: {local_time(event.ends_at, event.time_zone)}", gap=4)
    venue = ", ".join(part for part in (event.venue_name, event.address, event.city) if part)
    line(12, f"{labels['venue']}: {venue}", gap=4)
    line(12, f"{labels['type']}: {ticket_type.name}")
    line(12, f"{labels['attendee']}: {ticket.attendee_name}", gap=2)
    if ticket.seat:
        seat = ticket.seat
        place = messages.phrase("seat", language, section=seat.row.section.name, row=seat.row.label,
                                number=seat.number)
        if seat.accessible:
            place += f" ({messages.phrase('accessible', language)})"
        line(14, f"{labels['seat']}: {place}", "B")
    pdf.ln(4)
    line(20, ticket.ticket_number, "B", 4)

    # Large QR (80 mm) keeps it scannable from paper in colour or grayscale.
    y = pdf.get_y() + 4
    pdf.image(qr_image(ticket_qr_payload(ticket.id), box_size=12), x=65, y=y, w=80)
    pdf.set_xy(15, y + 86)
    pdf.set_font(family, "", 10)
    pdf.multi_cell(0, 5, text(labels["note"]), align="C")
    return bytes(pdf.output())
