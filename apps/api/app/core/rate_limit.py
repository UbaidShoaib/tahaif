import os

from slowapi import Limiter
from slowapi.util import get_remote_address

# TESTING=1 disables rate limiting so test suites don't hit per-IP limits
_enabled = os.getenv("TESTING", "0") != "1"
limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"], enabled=_enabled)
