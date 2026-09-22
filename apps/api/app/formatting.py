"""Human-readable money and dates for emails, PDFs, and audit descriptions."""
from datetime import datetime
from zoneinfo import ZoneInfo


def kzt(tiyin: int) -> str:
    """500000 -> '5 000 KZT', 150 -> '1.50 KZT'."""
    whole, cents = divmod(tiyin, 100)
    text = f"{whole:,}".replace(",", " ")
    return f"{text}.{cents:02d} KZT" if cents else f"{text} KZT"


def local_time(moment: datetime, time_zone: str) -> str:
    """'Sat 10 Oct 2026, 19:00 (Asia/Almaty)' in the event's own time zone."""
    return f"{moment.astimezone(ZoneInfo(time_zone)):%a %d %b %Y, %H:%M} ({time_zone})"
