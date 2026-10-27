"""Phone numbers as typed into chats ("0300 1234567", "0092-300-...", "+44 7700 900123")
turned into one E.164 form, so the same person matches across orders and a
wa.me link opens the right chat."""

import re
from typing import Annotated

from pydantic import AfterValidator

_DIGITS = re.compile(r"\d+")
# What a person types: digits with optional +, spaces, dashes, dots and brackets.
_TYPED_PHONE = re.compile(r"^\+?[\d\s().-]+$")


class InvalidPhoneError(ValueError):
    pass


def normalize_phone(raw: str, default_country_code: str = "92") -> str:
    """E.164 (``+923001234567``). Local Pakistani numbers (``03xx…``) get +92;
    ``00`` international prefixes become ``+``. Raises InvalidPhoneError when
    the result isn't 8–15 digits."""
    text = raw.strip()
    digits = "".join(_DIGITS.findall(text))
    if text.startswith("+"):
        pass
    elif digits.startswith("00"):
        digits = digits[2:]
    elif digits.startswith("0"):
        digits = default_country_code + digits[1:]
    elif len(digits) == 10 and digits.startswith("3"):
        # "300 1234567": a Pakistani mobile typed without the leading 0.
        digits = default_country_code + digits
    if not 8 <= len(digits) <= 15:
        raise InvalidPhoneError(f"Not a valid phone number: {raw!r}")
    return f"+{digits}"


def wa_me_digits(e164: str) -> str:
    """wa.me wants the number as digits only, no '+'."""
    return e164.lstrip("+")


def check_typed_phone(raw: str) -> str:
    """A phone number as typed into a form: kept as written, but only phone characters
    and 7–15 digits, so nothing else (markup, words) is stored as a number."""
    text = raw.strip()
    if not _TYPED_PHONE.match(text) or not 7 <= len("".join(_DIGITS.findall(text))) <= 15:
        raise ValueError("Enter a phone number using digits, with an optional + for the country code")
    return text


def _check_optional_typed_phone(raw: str | None) -> str | None:
    return check_typed_phone(raw) if raw is not None and raw.strip() else None


# For request bodies; on the optional one, blank means none.
TypedPhone = Annotated[str, AfterValidator(check_typed_phone)]
OptionalTypedPhone = Annotated[str | None, AfterValidator(_check_optional_typed_phone)]
