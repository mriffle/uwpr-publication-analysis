"""The NSF Award API: one award's amounts, dates and people (docs/09).

It covers every era, where USAspending starts at FY2008, and gives both amounts the amount rule
needs: `estimatedTotalAmt`, the plan at award time and never updated, and `fundsObligatedAmt`,
what has actually been awarded so far, supplements included.

One award per request: `printFields` no longer narrows the reply (measured 2026-09-26), so the
reply carries the award's abstract, and the PI's and programme officer's e-mail addresses and
telephone numbers. Only the fields below are kept; none of those is among them.
"""

import re
from typing import Any

from uwpr_pubs.http import HttpClient, HttpError, MalformedReplyError, Policy

BASE = "https://api.nsf.gov/services/v1/awards.json"
HOST = "nsf"
AWARD_ID = re.compile(r"[0-9]{7}")

AWARD_FIELDS = (
    "id",
    "agency",
    "title",
    "awardeeName",
    "awardeeCity",
    "awardeeStateCode",
    "awardeeCountryCode",
    "estimatedTotalAmt",
    "fundsObligatedAmt",
    "fundsObligated",
    "startDate",
    "expDate",
    "date",
    "initAmendmentDate",
    "latestAmendmentDate",
    "activeAwd",
    "transType",
    "dirAbbr",
    "divAbbr",
    "orgLongName",
    "orgLongName2",
    "fundProgramName",
    "cfdaNumber",
    "pdPIName",
    "piFirstName",
    "piMiddeInitial",  # sic: NSF's own spelling
    "piLastName",
)


class Nsf:
    def __init__(self, client: HttpClient, contact: str) -> None:
        self.client = client
        self.contact = contact  # sent in the User-Agent, by the client

    def award(self, award_id: str) -> dict[str, Any] | None:
        """The award's kept fields, or None when NSF has no award with that number.

        NSF's registry is complete, so None is an answer: the number is not an NSF award.
        """
        if not AWARD_ID.fullmatch(award_id):
            raise ValueError(f"an NSF award number is 7 digits: {award_id!r}")
        reply = self.client.get(BASE, {"id": award_id}, host=HOST, policy=Policy.REFRESH)
        payload = reply.json()
        response = payload.get("response") if isinstance(payload, dict) else None
        if not isinstance(response, dict):
            raise MalformedReplyError(f"{BASE}: HTTP {reply.status} with no response", reply.status)
        errors = [
            str(note.get("notificationMessage") or "no message")
            for note in response.get("serviceNotification") or []
            if isinstance(note, dict) and str(note.get("notificationType") or "").upper() == "ERROR"
        ]
        if errors:
            raise HttpError(f"nsf: {'; '.join(errors)}")
        awards = response.get("award")
        if not isinstance(awards, list):
            raise MalformedReplyError(f"{BASE}: HTTP {reply.status} with no award list", reply.status)
        for award in awards:
            if isinstance(award, dict) and award.get("id") == award_id:
                return {key: award[key] for key in AWARD_FIELDS if key in award}
        return None
