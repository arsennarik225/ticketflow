"""Refunds and cancellations (§4.9). Both invalidate the order's tickets, email the
buyer, and write to the audit log. Refunds are simulated and full-amount only."""
from sqlalchemy.orm import Session

from app.errors import conflict
from app.formatting import kzt
from app.models import Order, Refund, User, utcnow
from app.services import audit, notify


def refund(db: Session, order: Order, reason: str, idempotency_key: str, user: User) -> Refund:
    if order.refund:
        if order.refund.idempotency_key == idempotency_key:
            return order.refund  # a retry of the same request
        raise conflict("order_already_refunded", "This order was already refunded.")
    if order.status != "confirmed":
        raise conflict("order_not_refundable", f"This order is {order.status}.")
    if order.total == 0:
        raise conflict("order_is_free", "A free registration has nothing to refund. Cancel it instead.")
    order.payment.status = "refunded"
    result = Refund(order_id=order.id, payment_id=order.payment.id, amount=order.total, reason=reason,
                    idempotency_key=idempotency_key, created_by_user_id=user.id)
    db.add(result)
    order.status = "refunded"
    for ticket in order.tickets:
        if ticket.status != "cancelled":
            ticket.status = "refunded"
    audit.record(db, "order.refunded",
                 f"Refunded order {order.order_number}: {kzt(order.total)} (simulated). Reason: {reason}",
                 entity_type="order", entity_id=order.id, event_id=order.event_id, actor=user)
    notify.order_refunded(db, order, result)
    return result


def cancel_free(db: Session, order: Order, reason: str, user: User) -> None:
    if order.total > 0:
        raise conflict("order_is_paid", "Paid orders are refunded, not cancelled.")
    if order.status != "confirmed":
        raise conflict("order_not_cancellable", f"This order is {order.status}.")
    order.status, order.cancelled_at, order.cancel_reason = "cancelled", utcnow(), reason
    for ticket in order.tickets:
        ticket.status = "cancelled"
    audit.record(db, "order.cancelled", f"Cancelled registration {order.order_number}. Reason: {reason}",
                 entity_type="order", entity_id=order.id, event_id=order.event_id, actor=user)
    notify.order_cancelled(db, order, reason)
