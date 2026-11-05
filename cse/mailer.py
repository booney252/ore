"""Email through Resend (https://resend.com). Off until RESEND_API_KEY and ORE_MAIL_FROM are set:
then `send` logs what it would have sent and returns False, so nothing else has to know."""

from __future__ import annotations

import logging
import os

log = logging.getLogger("cse")


def available() -> bool:
    return bool(os.environ.get("RESEND_API_KEY") and os.environ.get("ORE_MAIL_FROM"))


def send(to: str, subject: str, html: str) -> bool:
    if not available():
        log.info("mail (not sent, no RESEND_API_KEY): %s | %s", to, subject)
        return False
    import requests

    r = requests.post("https://api.resend.com/emails", timeout=30,
                      headers={"Authorization": f"Bearer {os.environ['RESEND_API_KEY']}"},
                      json={"from": os.environ["ORE_MAIL_FROM"], "to": [to], "subject": subject, "html": html})
    if r.status_code >= 300:
        log.warning("mail to %s failed: %s %s", to, r.status_code, r.text[:200])
        return False
    return True
