"""Per-request values that deep layers need without threading them through every call.

Set once per HTTP request by middleware in main.py; read by the audit log.
"""

from contextvars import ContextVar

client_ip_var: ContextVar[str | None] = ContextVar("client_ip", default=None)
