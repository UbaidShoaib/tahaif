import resend  # pragma: no cover

from app.core.config import get_settings  # pragma: no cover

settings = get_settings()  # pragma: no cover


async def send_password_reset_email(to_email: str, reset_url: str) -> None:  # pragma: no cover
    resend.api_key = settings.resend_api_key
    resend.Emails.send(
        {
            "from": settings.email_from,
            "to": to_email,
            "subject": "Reset your Tahaif password",
            "html": f"""
                <p>We received a request to reset your password.</p>
                <p><a href="{reset_url}">Click here to reset your password</a></p>
                <p>This link expires in 1 hour. If you did not request this, ignore this email.</p>
            """,
        }
    )


async def send_order_confirmation_email(to_email: str, public_token: str, total_pkr: int) -> None:  # pragma: no cover
    resend.api_key = settings.resend_api_key
    pkr = total_pkr / 100
    tracking_url = f"{settings.frontend_url}/track/{public_token}"
    resend.Emails.send(
        {
            "from": settings.email_from,
            "to": to_email,
            "subject": "Your Tahaif order is confirmed!",
            "html": f"""
                <h2>Order Confirmed</h2>
                <p>Your order of <strong>PKR {pkr:,.0f}</strong> has been placed successfully.</p>
                <p>Order reference: <code>{public_token[:8].upper()}</code></p>
                <p><a href="{tracking_url}">Track your order</a></p>
                <p>Thank you for shopping with Tahaif!</p>
            """,
        }
    )


async def send_newsletter_confirmation_email(to_email: str, confirm_url: str) -> None:  # pragma: no cover
    resend.api_key = settings.resend_api_key
    resend.Emails.send(
        {
            "from": settings.email_from,
            "to": to_email,
            "subject": "Confirm your Tahaif newsletter subscription",
            "html": f"""
                <p>Thank you for subscribing to the Tahaif newsletter!</p>
                <p><a href="{confirm_url}">Click here to confirm your subscription</a></p>
                <p>If you did not subscribe, please ignore this email.</p>
            """,
        }
    )
