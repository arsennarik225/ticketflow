"""Payment simulation (§3.2, §4.6). No real money moves and every payment row is
marked simulated. Test tokens let the demo show both outcomes:

    tok_success              succeeds (so does any token not listed below)
    tok_declined             fails with payment_declined
    tok_insufficient_funds   fails with insufficient_funds
"""

DECLINES = {
    "tok_declined": ("payment_declined", "The payment was declined (simulated)."),
    "tok_insufficient_funds": ("insufficient_funds", "Insufficient funds (simulated)."),
}


def charge(payment_method_token: str) -> tuple[str, str] | None:
    """None on success, otherwise (error code, message)."""
    return DECLINES.get(payment_method_token)
