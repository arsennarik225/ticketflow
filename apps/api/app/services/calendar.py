"""iCalendar (.ics) export (§4.11, bonus). The UID is the event id, so an updated file
replaces the earlier calendar entry; a cancelled event exports as CANCELLED."""
from dataclasses import dataclass
from datetime import UTC, datetime
from urllib.parse import urlencode
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


@dataclass
class Links:
    ics: str
    google: str
    outlook: str


def calendar_links(event: Event) -> Links:
    """One-click 'add to calendar' links (§4.11). No calendar write access is requested."""
    location = ", ".join(p for p in (event.venue_name, event.address, event.city) if p)
    details = "\n\n".join(p for p in (event.description, f"{settings.web_url}/events/{event.id}") if p)
    start, end = (moment.astimezone(UTC) for moment in (event.starts_at, event.ends_at))
    google = urlencode({
        "action": "TEMPLATE", "text": event.title, "details": details, "location": location,
        "dates": f"{start:%Y%m%dT%H%M%SZ}/{end:%Y%m%dT%H%M%SZ}", "ctz": event.time_zone,
    })
    outlook = urlencode({
        "path": "/calendar/action/compose", "rru": "addevent", "subject": event.title, "body": details,
        "location": location, "startdt": f"{start:%Y-%m-%dT%H:%M:%SZ}", "enddt": f"{end:%Y-%m-%dT%H:%M:%SZ}",
    })
    return Links(
        ics=f"{settings.api_url}/v1/events/{event.id}/calendar.ics",
        google=f"https://calendar.google.com/calendar/render?{google}",
        outlook=f"https://outlook.live.com/calendar/0/deeplink/compose?{outlook}",
    )
