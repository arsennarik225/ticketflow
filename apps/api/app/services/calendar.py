"""iCalendar (.ics) export (§4.11, bonus). The UID is the event id, so an updated file
replaces the earlier calendar entry; a cancelled event exports as CANCELLED."""
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from app.config import settings
from app.models import Event


def _escape(value: str) -> str:
    return (value.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,")
            .replace("\r\n", "\\n").replace("\n", "\\n"))


def _fold(line: str) -> list[str]:
    """RFC 5545: lines longer than 75 octets continue on the next line after a space."""
    out, current = [], ""
    for char in line:
        if len((current + char).encode()) > 75:
            out.append(current)
            current = " "
        current += char
    return out + [current]


def _offset(moment: datetime) -> str:
    minutes = int(moment.utcoffset().total_seconds() // 60)
    sign = "+" if minutes >= 0 else "-"
    return f"{sign}{abs(minutes) // 60:02d}{abs(minutes) % 60:02d}"


def event_ics(event: Event) -> str:
    zone = ZoneInfo(event.time_zone)
    start, end = event.starts_at.astimezone(zone), event.ends_at.astimezone(zone)
    url = f"{settings.web_url}/events/{event.id}"
    cancelled = event.status == "cancelled"
    location = ", ".join(p for p in (event.venue_name, event.address, event.city) if p)
    description = "\n\n".join(p for p in (event.description, url) if p)
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//BiletFlow//Events//EN",
        "CALSCALE:GREGORIAN",
        f"METHOD:{'CANCEL' if cancelled else 'PUBLISH'}",
        # Kazakhstan has no daylight saving time, so one fixed offset describes the zone.
        "BEGIN:VTIMEZONE",
        f"TZID:{event.time_zone}",
        "BEGIN:STANDARD",
        "DTSTART:19700101T000000",
        f"TZOFFSETFROM:{_offset(start)}",
        f"TZOFFSETTO:{_offset(start)}",
        "END:STANDARD",
        "END:VTIMEZONE",
        "BEGIN:VEVENT",
        f"UID:{event.id}@biletflow",
        f"SEQUENCE:{int(event.updated_at.timestamp())}",
        f"DTSTAMP:{datetime.now(UTC):%Y%m%dT%H%M%SZ}",
        f"DTSTART;TZID={event.time_zone}:{start:%Y%m%dT%H%M%S}",
        f"DTEND;TZID={event.time_zone}:{end:%Y%m%dT%H%M%S}",
        f"SUMMARY:{_escape(event.title)}",
        f"DESCRIPTION:{_escape(description)}",
        f"LOCATION:{_escape(location)}",
        f"URL:{url}",
        f"STATUS:{'CANCELLED' if cancelled else 'CONFIRMED'}",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    return "\r\n".join(part for line in lines for part in _fold(line)) + "\r\n"
