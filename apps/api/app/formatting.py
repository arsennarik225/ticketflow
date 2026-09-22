"""Money and dates for emails, PDFs, and audit descriptions. Formats are numeric, so they
read the same in Kazakh, Russian, and English."""
from datetime import datetime
from zoneinfo import ZoneInfo


def kzt(tiyin: int) -> str:
    """500000 -> '5 000 KZT', 150 -> '1.50 KZT'."""
    whole, cents = divmod(tiyin, 100)
    text = f"{whole:,}".replace(",", " ")
    return f"{text}.{cents:02d} KZT" if cents else f"{text} KZT"


def local_time(moment: datetime, time_zone: str) -> str:
    """'06.10.2026 19:00 (Asia/Almaty)' in the event's own time zone."""
    return f"{moment.astimezone(ZoneInfo(time_zone)):%d.%m.%Y %H:%M} ({time_zone})"
