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
