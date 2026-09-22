"""Request and response bodies. Names and shapes follow docs/api/openapi.yaml, and the
tests validate every response against that file. JSON uses camelCase; None is omitted."""
from datetime import datetime
from typing import Annotated, Generic, Literal, TypeVar

from pydantic import (
    AwareDatetime, BaseModel, ConfigDict, EmailStr, Field, StringConstraints, model_validator,
)
from pydantic.alias_generators import to_camel

T = TypeVar("T")

EventStatus = Literal["draft", "upcoming", "active", "completed", "cancelled"]
Visibility = Literal["public", "unlisted", "private"]
TicketStatus = Literal["valid", "checked_in", "cancelled", "refunded"]
CaseStatus = Literal["open", "in_progress", "waiting_for_customer", "resolved"]
CaseCategory = Literal[
    "ticket_delivery", "payment", "refund", "seating", "event_information", "check_in", "account", "technical"
]
Language = Literal["kk", "ru", "en"]  # emails and PDF tickets (SRS §7)
Role = Literal["attendee", "organizer", "event_admin", "platform_admin"]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
WebUrl = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000, pattern=r"^https?://\S+$")]
Body = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)]


class Schema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ListOf(Schema, Generic[T]):
    data: list[T]
    total: int | None = None


class ErrorDetail(Schema):
    code: str
    message: str


# ------------------------------------------------------------------ money

class Money(Schema):
    """Integer tiyin. 500000 = 5000.00 KZT."""

    amount: int
    currency: Literal["KZT"] = "KZT"


class MoneyIn(Schema):
    amount: int = Field(ge=0, strict=True)  # strict: 5000.0 is rejected, money is never a float
    currency: Literal["KZT"] = "KZT"


def money(amount: int) -> Money:
    return Money(amount=amount)


# ------------------------------------------------------------------ auth and accounts

class RegisterIn(Schema):
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    full_name: Name
    language: Language = "ru"


class MeIn(Schema):
    full_name: Name | None = None
    language: Language | None = None


class TokenIn(Schema):
    token: str


class LoginIn(Schema):
    email: EmailStr
    password: str


class RefreshIn(Schema):
    refresh_token: str


class ForgotPasswordIn(Schema):
    email: EmailStr


class ResetPasswordIn(Schema):
    token: str
    password: str = Field(min_length=8, max_length=200)


class UserOut(Schema):
    id: str
    email: str
    email_verified: bool
    full_name: str | None = None
    language: Language
    roles: list[Role]


class TokensOut(Schema):
    access_token: str
    refresh_token: str
    expires_in: int
    user: UserOut


class OrganizerProfileIn(Schema):
    display_name: Name
    description: str | None = Field(None, max_length=5000)
    contact_email: EmailStr
    contact_phone: str | None = Field(None, max_length=50)


class PayoutAccountOut(Schema):
    status: Literal["pending", "connected", "rejected"]
    masked_account: str | None = None
    simulated: Literal[True] = True


class OrganizerProfileOut(Schema):
    display_name: str
    description: str | None = None
    contact_email: str
    contact_phone: str | None = None
    identity_status: Literal["not_submitted", "pending", "verified", "rejected"]
    payout_account: PayoutAccountOut | None = None


class IdentityIn(Schema):
    legal_name: Name
    document_type: Literal["individual_id", "business_registration"] | None = None


class IdentityOut(Schema):
    status: Literal["pending", "verified", "rejected"]
    simulated: Literal[True] = True


class PayoutAccountIn(Schema):
    account_holder_name: Name
    sandbox_account_token: str = Field(min_length=4, max_length=200)


# ------------------------------------------------------------------ events

class EventIn(Schema):
    title: Name
    description: str | None = Field(None, max_length=20000)
    category: str | None = Field(None, max_length=100)
    image_url: WebUrl | None = None
    venue_name: Name
    address: str | None = Field(None, max_length=500)
    city: str = Field(min_length=1, max_length=100)
    starts_at: AwareDatetime
    ends_at: AwareDatetime
    time_zone: str = Field(min_length=1, max_length=64)
    visibility: Visibility = "public"
    registration_opens_at: AwareDatetime | None = None
    registration_closes_at: AwareDatetime | None = None
    capacity: int | None = Field(None, ge=0)
    refund_policy: str | None = Field(None, max_length=5000)


class EventPatchIn(Schema):
    """Partial update: only the fields that are sent change."""

    title: Name | None = None
    description: str | None = Field(None, max_length=20000)
    category: str | None = Field(None, max_length=100)
    image_url: WebUrl | None = None
    venue_name: Name | None = None
    address: str | None = Field(None, max_length=500)
    city: str | None = Field(None, min_length=1, max_length=100)
    starts_at: AwareDatetime | None = None
    ends_at: AwareDatetime | None = None
    time_zone: str | None = Field(None, min_length=1, max_length=64)
    visibility: Visibility | None = None
    registration_opens_at: AwareDatetime | None = None
    registration_closes_at: AwareDatetime | None = None
    capacity: int | None = Field(None, ge=0)
    refund_policy: str | None = Field(None, max_length=5000)


class ReasonIn(Schema):
    reason: Body


class TermsIn(Schema):
    terms_version: str = Field(min_length=1, max_length=50)


class TicketTypeIn(Schema):
    name: Name
    description: str | None = Field(None, max_length=2000)
    price: MoneyIn
    quantity: int = Field(ge=0)
    sales_start_at: AwareDatetime | None = None
    sales_end_at: AwareDatetime | None = None
    max_per_order: int | None = Field(None, ge=1)
    hidden: bool = False
    seat_category: str | None = Field(None, min_length=1, max_length=50)


class TicketTypePatchIn(Schema):
    name: Name | None = None
    description: str | None = Field(None, max_length=2000)
    price: MoneyIn | None = None
    quantity: int | None = Field(None, ge=0)
    sales_start_at: AwareDatetime | None = None
    sales_end_at: AwareDatetime | None = None
    max_per_order: int | None = Field(None, ge=1)
    hidden: bool | None = None
    seat_category: str | None = Field(None, min_length=1, max_length=50)


class TicketTypeOut(Schema):
    id: str
    event_id: str
    name: str
    description: str | None = None
    price: Money
    quantity: int
    sales_start_at: datetime | None = None
    sales_end_at: datetime | None = None
    max_per_order: int | None = None
    hidden: bool
    seat_category: str | None = None
    on_sale: bool
    available: int
    held: int
    sold: int
    refunded: int
    checked_in: int


class AppliedPromo(Schema):
    campaign_id: str
    code: str
    discount: Money
    discount_type: Literal["percentage", "fixed_amount"] | None = None
    percent_off: float | None = None
    amount_off: Money | None = None


class CalendarLinks(Schema):
    ics: str
    google: str
    outlook: str


class EventOut(Schema):
    id: str
    organizer_id: str
    organizer_name: str | None = None
    title: str
    description: str | None = None
    category: str | None = None
    image_url: str | None = None
    venue_name: str
    address: str | None = None
    city: str
    starts_at: datetime
    ends_at: datetime
    time_zone: str
    visibility: Visibility
    registration_opens_at: datetime | None = None
    registration_closes_at: datetime | None = None
    capacity: int | None = None
    refund_policy: str | None = None
    status: EventStatus
    paid_sales_active: bool
    suspended_reason: str | None = None
    venue_id: str | None = None  # set = assigned seating (GET /events/{id}/seats)
    calendar_links: CalendarLinks | None = None
    ticket_types: list[TicketTypeOut] | None = None
    applied_promo: AppliedPromo | None = None
    promo_error: ErrorDetail | None = None


class ActivationSteps(Schema):
    has_paid_ticket_type: bool
    identity_verified: bool
    fee_paid: bool
    payout_account_connected: bool
    terms_accepted: bool


class ActivationOut(Schema):
    event_id: str
    active: bool
    activation_fee: Money
    steps: ActivationSteps
    suspended_reason: str | None = None


class StaffIn(Schema):
    email: EmailStr
    can_reverse_check_in: bool = False


class StaffAssignmentOut(Schema):
    id: str
    event_id: str
    user_id: str | None = None
    email: str
    can_reverse_check_in: bool


# ------------------------------------------------------------------ campaigns

class CampaignIn(Schema):
    name: Name
    discount_type: Literal["percentage", "fixed_amount"]
    percent_off: float | None = Field(None, ge=0, le=100)
    amount_off: MoneyIn | None = None
    valid_from: AwareDatetime | None = None
    valid_until: AwareDatetime | None = None
    max_redemptions: int | None = Field(None, ge=0)
    disabled: bool = False
    ticket_type_ids: list[str] | None = None

    @model_validator(mode="after")
    def discount_matches_type(self):
        if self.discount_type == "percentage" and self.percent_off is None:
            raise ValueError("percentOff is required for a percentage discount")
        if self.discount_type == "fixed_amount" and not (self.amount_off and self.amount_off.amount > 0):
            raise ValueError("amountOff above 0 is required for a fixed_amount discount")
        return self


class CampaignPatchIn(Schema):
    name: Name | None = None
    discount_type: Literal["percentage", "fixed_amount"] | None = None
    percent_off: float | None = Field(None, ge=0, le=100)
    amount_off: MoneyIn | None = None
    valid_from: AwareDatetime | None = None
    valid_until: AwareDatetime | None = None
    max_redemptions: int | None = Field(None, ge=0)
    disabled: bool | None = None
    ticket_type_ids: list[str] | None = None


class CampaignOut(Schema):
    id: str
    event_id: str
    name: str
    code: str
    campaign_url: str
    qr_image_url: str
    discount_type: Literal["percentage", "fixed_amount"]
    percent_off: float | None = None
    amount_off: Money | None = None
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    max_redemptions: int | None = None
    disabled: bool
    ticket_type_ids: list[str]
    redemptions: int
    orders: int
    tickets_sold: int
    gross_revenue: Money
    discount_total: Money
    revenue: Money


# ------------------------------------------------------------------ checkout

class AttendeeIn(Schema):
    full_name: Name
    email: EmailStr
    phone: str | None = Field(None, max_length=50)


class CheckoutItemIn(Schema):
    ticket_type_id: str
    quantity: int = Field(ge=1, le=100)


class CheckoutIn(Schema):
    """General admission sends `items`; assigned seating sends `seat_ids` instead."""

    event_id: str
    items: list[CheckoutItemIn] = Field(default_factory=list, max_length=20)
    seat_ids: list[str] = Field(default_factory=list, max_length=20)
    attendees: list[AttendeeIn] | None = Field(None, max_length=100)
    campaign_token: str | None = None
    language: Language | None = None

    @model_validator(mode="after")
    def something_to_buy(self):
        if bool(self.items) == bool(self.seat_ids):
            raise ValueError("send either items or seatIds")
        return self


class PromoCodeIn(Schema):
    code: str | None = Field(None, max_length=100)
    campaign_token: str | None = Field(None, max_length=200)

    @model_validator(mode="after")
    def exactly_one(self):
        if bool(self.code) == bool(self.campaign_token):
            raise ValueError("send either code or campaignToken")
        return self


class ConfirmIn(Schema):
    payment_method_token: str | None = Field(None, max_length=200)
    contact_email: EmailStr | None = None


class CheckoutItemOut(Schema):
    ticket_type_id: str
    ticket_type_name: str
    quantity: int
    unit_price: Money


class CheckoutSessionOut(Schema):
    id: str
    event_id: str
    status: Literal["open", "confirmed", "expired", "abandoned"]
    items: list[CheckoutItemOut]
    subtotal: Money
    discount: Money
    processing_fee: Money
    total: Money
    applied_promo: AppliedPromo | None = None
    requires_payment: bool
    expires_at: datetime


# ------------------------------------------------------------------ orders and tickets

class AttendeeInfo(Schema):
    full_name: str
    email: str
    phone: str | None = None


class SeatInfo(Schema):
    section: str
    row: str
    number: int
    accessible: bool


class TicketOut(Schema):
    id: str
    ticket_number: str
    order_id: str
    event_id: str
    event_title: str
    event_starts_at: datetime
    venue_name: str
    ticket_type_name: str
    attendee: AttendeeInfo
    seat: SeatInfo | None = None
    status: TicketStatus
    qr_payload: str
    pdf_url: str


class PaymentOut(Schema):
    id: str
    purpose: Literal["ticket_order", "activation_fee"]
    amount: Money
    fee: Money
    status: Literal["succeeded", "failed", "refunded"]
    simulated: Literal[True] = True
    order_id: str | None = None
    event_id: str
    failure_code: str | None = None
    created_at: datetime


class OrderOut(Schema):
    id: str
    order_number: str
    event_id: str
    event_title: str
    status: Literal["confirmed", "cancelled", "refunded"]
    buyer_name: str
    buyer_email: str
    subtotal: Money
    discount: Money
    processing_fee: Money
    total: Money
    applied_promo: AppliedPromo | None = None
    tickets: list[TicketOut]
    payment: PaymentOut | None = None
    created_at: datetime


class RefundOut(Schema):
    id: str
    order_id: str
    amount: Money
    reason: str
    simulated: Literal[True] = True
    created_at: datetime


class AttendeeOut(Schema):
    ticket_id: str
    ticket_number: str
    order_id: str
    full_name: str
    email: str
    ticket_type_name: str
    seat_label: str | None = None
    status: TicketStatus
    checked_in_at: datetime | None = None


class NotificationOut(Schema):
    id: str
    kind: str
    subject: str
    body: str
    created_at: datetime


# ------------------------------------------------------------------ check-in

class VerifyIn(Schema):
    qr_payload: str = Field(min_length=1, max_length=2000)


class CheckInIn(Schema):
    qr_payload: str | None = Field(None, max_length=2000)
    ticket_id: str | None = None

    @model_validator(mode="after")
    def exactly_one(self):
        if bool(self.qr_payload) == bool(self.ticket_id):
            raise ValueError("send either qrPayload or ticketId")
        return self


class CheckInOut(Schema):
    id: str
    ticket_id: str
    ticket_number: str
    attendee_name: str
    checked_in_at: datetime
    checked_in_by_user_id: str
    method: Literal["qr", "manual", "offline"]


class VerifyResult(Schema):
    result: Literal[
        "valid", "invalid", "cancelled", "refunded", "already_used", "wrong_event",
        "rejected_campaign_qr",
    ]
    message: str
    ticket: TicketOut | None = None
    previous_check_in: CheckInOut | None = None


class CheckInSearchOut(Schema):
    data: list[AttendeeOut]
    registered: int
    checked_in: int


class OfflineTicket(Schema):
    ticket_id: str
    ticket_number: str
    qr_payload: str
    attendee_name: str
    ticket_type_name: str
    seat_label: str | None = None
    status: TicketStatus


class OfflineListOut(Schema):
    event_id: str
    generated_at: datetime
    tickets: list[OfflineTicket]


class OfflineCheckInIn(Schema):
    ticket_id: str
    checked_in_at: AwareDatetime


class OfflineSyncIn(Schema):
    check_ins: list[OfflineCheckInIn] = Field(min_length=1, max_length=1000)


class OfflineSyncResult(Schema):
    ticket_id: str
    result: Literal["accepted", "already_used", "cancelled", "refunded", "invalid", "wrong_event"]
    check_in: CheckInOut | None = None


class OfflineSyncOut(Schema):
    results: list[OfflineSyncResult]


# ------------------------------------------------------------------ assigned seating (§4.3.1, bonus)

class CategoryCount(Schema):
    price_category: str
    seats: int
    accessible: int


class VenueSummaryOut(Schema):
    id: str
    name: str
    city: str
    address: str | None = None
    seat_count: int
    price_categories: list[CategoryCount]


class VenueSeatOut(Schema):
    id: str
    number: int
    price_category: str
    accessible: bool


class VenueRowOut(Schema):
    id: str
    label: str
    seats: list[VenueSeatOut]


class VenueSectionOut(Schema):
    id: str
    name: str
    rows: list[VenueRowOut]


class VenueOut(VenueSummaryOut):
    sections: list[VenueSectionOut]


class SeatingIn(Schema):
    venue_id: str | None
    blocked_seat_ids: list[str] = Field(default_factory=list, max_length=500)


class MapSeat(Schema):
    id: str
    number: int
    price_category: str
    accessible: bool
    status: Literal["available", "held", "sold", "unavailable"]
    ticket_type_id: str | None = None
    price: Money | None = None


class MapRow(Schema):
    label: str
    seats: list[MapSeat]


class MapSection(Schema):
    name: str
    rows: list[MapRow]


class SeatMapOut(Schema):
    event_id: str
    venue_id: str
    venue_name: str
    sections: list[MapSection]


# ------------------------------------------------------------------ support

class SupportCaseIn(Schema):
    category: CaseCategory
    subject: Name
    message: Body
    event_id: str | None = None
    order_id: str | None = None
    ticket_id: str | None = None


class SupportCasePatchIn(Schema):
    status: CaseStatus | None = None
    assignee_user_id: str | None = None


class SupportMessageIn(Schema):
    body: Body


class EscalateIn(Schema):
    reason: Body | None = None


class AttachmentOut(Schema):
    id: str
    filename: str
    content_type: str
    size: int
    url: str


class SupportMessageOut(Schema):
    id: str
    author_user_id: str
    author_name: str
    body: str
    attachments: list[AttachmentOut]
    created_at: datetime


class SupportCaseOut(Schema):
    id: str
    category: CaseCategory
    subject: str
    status: CaseStatus
    handled_by: Literal["organizer", "platform"]
    requester_user_id: str
    event_id: str | None = None
    order_id: str | None = None
    ticket_id: str | None = None
    assignee_user_id: str | None = None
    messages: list[SupportMessageOut] | None = None
    created_at: datetime
    updated_at: datetime


# ------------------------------------------------------------------ insights

class TimelinePoint(Schema):
    date: str  # YYYY-MM-DD in the event's time zone
    tickets_sold: int
    gross_sales: Money


class TicketTypeSales(Schema):
    ticket_type_id: str
    name: str
    quantity: int
    sold: int
    remaining: int
    gross_sales: Money


class CampaignSales(Schema):
    campaign_id: str
    name: str
    code: str
    redemptions: int
    tickets_sold: int
    gross_sales: Money
    discounts: Money
    net_revenue: Money


class Attendance(Schema):
    registered: int
    checked_in: int
    absent: int
    check_in_percent: float


class EventAnalyticsOut(Schema):
    event_id: str
    capacity: int
    tickets_sold: int
    tickets_remaining: int
    percent_sold: float
    gross_sales: Money
    discounts: Money | None = None
    refunds: Money | None = None
    fees: Money | None = None
    net_revenue: Money | None = None
    estimated_payout: Money | None = None
    sales_over_time: list[TimelinePoint]
    by_ticket_type: list[TicketTypeSales]
    campaigns: list[CampaignSales]
    attendance: Attendance


class AuditEntryOut(Schema):
    id: str
    created_at: datetime
    action: str
    entity_type: str
    entity_id: str | None = None
    description: str
    actor_user_id: str | None = None
    actor_name: str | None = None


# ------------------------------------------------------------------ admin

class AdminUserOut(UserOut):
    created_at: datetime
    suspended_at: datetime | None = None
    suspended_reason: str | None = None


class EventReportOut(Schema):
    id: str
    event_id: str
    event_title: str
    reporter_user_id: str
    reason: str
    created_at: datetime


class PlatformSettingsOut(Schema):
    activation_fee: Money
    processing_fee_percent: float
    processing_fee_paid_by: Literal["organizer", "attendee"]
    checkout_hold_minutes: int
    guest_checkout_enabled: bool
    terms_version: str


class PlatformSettingsIn(Schema):
    activation_fee: MoneyIn | None = None
    processing_fee_percent: float | None = Field(None, ge=0, le=100)
    processing_fee_paid_by: Literal["organizer", "attendee"] | None = None
    checkout_hold_minutes: int | None = Field(None, ge=1, le=120)
    guest_checkout_enabled: bool | None = None
    terms_version: str | None = Field(None, min_length=1, max_length=50)
