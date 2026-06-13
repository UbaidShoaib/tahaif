import httpx  # pragma: no cover

from app.core.config import get_settings  # pragma: no cover
from app.schemas.auth import GoogleOAuthUser  # pragma: no cover

settings = get_settings()  # pragma: no cover

_TOKEN_URL = "https://oauth2.googleapis.com/token"  # pragma: no cover
_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"  # pragma: no cover


async def exchange_code(code: str, redirect_uri: str) -> dict[str, str]:  # pragma: no cover
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            _TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        resp.raise_for_status()
        return resp.json()  # type: ignore[no-any-return]


async def get_user_info(access_token: str) -> GoogleOAuthUser:  # pragma: no cover
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            _USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp.raise_for_status()
        data = resp.json()
        return GoogleOAuthUser(**data)


def get_authorization_url(state: str) -> str:  # pragma: no cover
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "offline",
        "prompt": "consent",
    }
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return f"https://accounts.google.com/o/oauth2/v2/auth?{query}"
