"""Grant numbers as papers write them, and the keys they become (docs/09 §6, §8.2).

A funding string is first split into its items (§6.1): on semicolons, on commas that are not
inside a number (`P30 DK 089,507`), on " and ", and on a spaced dash between two numbers
(`RTG 2467 - 391498659`, a training-group number beside its project ID). Parentheses that hold
initials, a year or no digit at all are dropped first, so a comma inside them splits nothing.
`K99/R00` stays whole.

Each item is then read three ways, by the resolver's steps:

- **NIH** (§6.2): the tolerant parser gives zero or more `NihNumber`s - activity code, institute
  code and serial candidates - fixing O or I written for 0 or 1, digits split by a space, comma
  or dash, a serial run into its support year, and a serial short of six digits.
- **Contracts** (§6.7): `HHSN` with twelve digits and a letter, and `75N` numbers. `N01…`
  contracts parse as NIH numbers with an `N` activity code.
- **Other agencies** (§6.8-6.10): the letters and digits left once labels and the agency's
  prefixes are stripped, with an NSF number seven digits and FAPESP's two-digit year expanded.

Pure and clock-free: the data year arrives as an argument.
"""

import re
import unicodedata
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Literal

from uwpr_pubs.funding.overrides import DASHES as DASH_SET

# The grant-key grammar (docs/09 §8.2), which `common.schema.json` holds as `$defs/grantKey`: a
# family prefix and one or two segments of uppercase letters and digits.
GRANT_KEY = re.compile(r"^(NIH-contract|[A-Z][A-Z0-9-]*)(:[A-Z0-9]+){1,2}$")
AGENCY_CODE = re.compile(r"^[A-Z][A-Z0-9-]*$")
CONTRACT_FAMILY = "NIH-contract"
MISC = "MISC"
SERIAL_DIGITS = 6  # an NIH serial, zero-filled
SHORTEST_SERIAL, LONGEST_SERIAL = 4, 9  # as written: shorter is zero-filled, longer trimmed
NSF_DIGITS = 7
SHORTEST_FRAGMENT = 3  # §6.10

# Hyphen-minus first, so the string can open a regex character class as a literal dash.
DASHES = "".join(sorted(DASH_SET))
_UNICODE_DASH = re.compile(f"[{DASHES[1:]}]")
_TRAILING = " .,;:?!"
_YEARS = re.compile(r"^\s*(?:19|20)[0-9]{2}(?:\s*-\s*(?:19|20)[0-9]{2})?\s*$")
# Words that introduce a number without being part of it: "Contract No:", "project-ID:", "#".
_LABEL = re.compile(
    r"^(?:#|(?:contract|grants?|awards?|project(?:\s*-?\s*id)?|id|no|nr|number|ref(?:erence)?)\b\.?:?)\s*",
    re.IGNORECASE,
)
_SUB_AWARD = re.compile(r"\s*:\s*[0-9]+$")


def alnum(text: str) -> str:
    """The uppercase ASCII letters and digits of `text`: `ÚNKP-21-3` → `UNKP213` (a key segment)."""
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(ch for ch in decomposed.upper() if ch.isascii() and ch.isalnum())


def normalise(raw: str) -> str:
    """NFKC (no-break spaces become spaces), every dash a hyphen, whitespace collapsed."""
    text = _UNICODE_DASH.sub("-", unicodedata.normalize("NFKC", raw))
    return " ".join(text.split())


def _droppable(inside: str) -> bool:
    """Parentheses holding initials, a year, or nothing numeric: `(A.F.G.Q.)`, `(2015-2018)`."""
    return not any(ch.isdigit() for ch in inside) or bool(_YEARS.match(inside))


def _drop_parentheticals(text: str) -> str:
    out: list[str] = []
    i = 0
    while i < len(text):
        if text[i] == "(":
            close = text.find(")", i + 1)
            end = len(text) if close < 0 else close + 1  # an unclosed "(" runs to the end
            inside = text[i + 1 : close if close >= 0 else len(text)]
            if _droppable(inside):
                i = end
                continue
        out.append(text[i])
        i += 1
    return " ".join("".join(out).split())


def clean(raw: str) -> str:
    """One item as the resolver reads it: normalised, droppable parentheses and trailing
    punctuation removed. Case is kept; readers upper-case what they compare."""
    return _drop_parentheticals(normalise(raw)).strip(_TRAILING).strip()


def _separator_at(text: str, i: int) -> int:
    """The length of a list separator starting at `text[i]`, or 0."""
    ch = text[i]
    if ch == ";":
        return 1
    if ch == ",":
        between_digits = 0 < i < len(text) - 1 and text[i - 1].isdigit() and text[i + 1].isdigit()
        return 0 if between_digits else 1
    if ch.isspace():
        rest = text[i:]
        match = re.match(r"\s+and\s+", rest, re.IGNORECASE)
        if match:
            return match.end()
        match = re.match(f"\\s+[{DASHES}]\\s+", rest)
        after = i + match.end() if match else len(text)
        if match and i > 0 and text[i - 1].isdigit() and after < len(text) and text[after].isdigit():
            return match.end()
    return 0


def split_list(raw: str) -> list[str]:
    """The items of a funding string, each as written (whitespace collapsed).

    Separators inside parentheses split nothing: "(A.F.G.Q., L.L.)" is one aside.
    """
    text = " ".join(raw.split())
    items: list[str] = []
    depth = 0
    start = i = 0
    while i < len(text):
        ch = text[i]
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth = max(0, depth - 1)
        elif depth == 0:
            width = _separator_at(text, i)
            if width:
                items.append(text[start:i])
                i += width
                start = i
                continue
        i += 1
    items.append(text[start:])
    return [item.strip(" ,;") for item in items if clean(item)]


# --- NIH (§6.2) ----------------------------------------------------------------------------

Fix = Literal[
    "O for 0",
    "I for 1",
    "split digits joined",
    "long serial",
    "zero-filled",
    "bare serial",
    "garbled activity code ignored",
    "text before the number ignored",
]
NORMALISING: frozenset[Fix] = frozenset(
    {
        "O for 0",
        "I for 1",
        "split digits joined",
        "long serial",
        "zero-filled",
        "bare serial",
        "garbled activity code ignored",
        "text before the number ignored",
    }
)


@dataclass(frozen=True)
class NihNumber:
    """One NIH number parsed from an item (docs/09 §6.2).

    `serials` are six-digit candidates: one, or the head and tail of a seven- to nine-digit
    serial. `written` is the serial's digits as written, O and I read as 0 and 1 and split parts
    joined, before zero-filling or trimming: what §6.5's near-miss rule edits.
    """

    activity: str | None  # None for an institute code and serial alone ("bare")
    ic: str
    serials: tuple[str, ...]
    written: str
    app_type: str | None = None
    suffix: str | None = None
    fixes: tuple[Fix, ...] = ()

    @property
    def full(self) -> bool:
        """An activity code, an institute code and a serial: "full NIH format" (§6.4)."""
        return self.activity is not None

    @property
    def is_contract(self) -> bool:
        """`N01…`: an R&D contract, keyed by its number (§6.7), not a grant."""
        return self.activity is not None and self.activity.startswith("N")

    def cores(self, activity: str | None = None) -> tuple[str, ...]:
        code = activity or self.activity
        return tuple(f"{code}{self.ic}{serial}" for serial in self.serials) if code else ()

    @property
    def number(self) -> str:
        """The written number without type or suffix: a `MISC:` key's segment (`P01HL0996`)."""
        return f"{self.activity or ''}{self.ic}{self.written}"


_HEAD = re.compile(r"(?:([1-9]) ?)?([A-Z][A-Z0-9]{2})[ \-]{0,3}([A-Z]{2})[ \-]{0,3}(?=[0-9OI])")
_BARE_HEAD = re.compile(r"([A-Z]{2})[ \-]{0,3}(?=[0-9OI])")
_SERIAL_RUN = re.compile(r"[0-9OI]+")
_SUFFIX = re.compile(r"(?:-?([0-9]{2}))?((?:[AS][0-9]{1,2})*)")
_YEAR_SUFFIX = re.compile(r"-[0-9]{2}(?:[AS][0-9]{1,2})*(?![A-Z0-9])")
# A component's number after a dash, alone or after the support year: PubMed writes a centre's
# component as `P30 ES007033-6364`, and a JATS award ID `S10 RR023044-010001` (year 01, then 0001).
# Read only after a whole six-digit serial, where the digits cannot be the rest of a split serial.
_COMPONENT_SUFFIX = re.compile(r"-(?:[0-9]{2})?[0-9]{4}(?![A-Z0-9])")


def _fix_activity(code: str) -> tuple[str, list[Fix]]:
    """O written for 0 in an activity code's last two places, and I for 1 beside a digit."""
    fixes: list[Fix] = []
    chars = list(code)
    for k in (1, 2):
        if chars[k] == "O":
            chars[k] = "0"
            fixes.append("O for 0")
    for k, other in ((1, 2), (2, 1)):
        if chars[k] == "I" and chars[other].isdigit():
            chars[k] = "1"
            fixes.append("I for 1")
    return "".join(chars), fixes


def _read_serial(text: str, start: int) -> tuple[str, int, list[Fix]] | None:
    """The serial's digits from `start`, joining split parts, and where it ends.

    Parts are joined across one space, comma or dash while the serial is short of six digits,
    when the parts make exactly six (`R01CA10720 9`, `P30 DK 089,507`, `R01-HL1-26028`) - but
    never a dash and two digits that end the number, which is a support year (`CA11273-04S1`).
    """
    run = _SERIAL_RUN.match(text, start)
    digits, end = (run.group(), run.end()) if run else ("", start)
    fixes: list[Fix] = []
    while len(digits) < SERIAL_DIGITS and end < len(text) - 1 and text[end] in " ,-":
        following = _SERIAL_RUN.match(text, end + 1)
        if following is None or len(digits) + len(following.group()) != SERIAL_DIGITS:
            break
        if text[end] == "-" and _YEAR_SUFFIX.match(text, end):
            break
        digits, end = digits + following.group(), following.end()
        fixes.append("split digits joined")
    if not any(ch.isdigit() for ch in digits):
        return None
    if "O" in digits:
        fixes.append("O for 0")
    if "I" in digits:
        fixes.append("I for 1")
    return digits.replace("O", "0").replace("I", "1"), end, fixes


def _serial_candidates(written: str) -> tuple[tuple[str, ...], list[Fix]] | None:
    if SHORTEST_SERIAL <= len(written) <= SERIAL_DIGITS:
        filled = len(written) < SERIAL_DIGITS
        return (written.zfill(SERIAL_DIGITS),), (["zero-filled"] if filled else [])
    if SERIAL_DIGITS < len(written) <= LONGEST_SERIAL:
        head, tail = written[:SERIAL_DIGITS], written[-SERIAL_DIGITS:]
        return ((head,) if head == tail else (head, tail)), ["long serial"]
    return None


def _finish(  # noqa: PLR0913 - where the serial starts, and what the head already read
    text: str,
    start: int,
    *,
    activity: str | None,
    ic: str,
    app_type: str | None,
    fixes: list[Fix],
) -> tuple[NihNumber, int] | None:
    serial = _read_serial(text, start)
    if serial is None:
        return None
    written, end, serial_fixes = serial
    candidates = _serial_candidates(written)
    if candidates is None:
        return None
    serials, fill_fixes = candidates
    component = _COMPONENT_SUFFIX.match(text, end) if len(written) == SERIAL_DIGITS else None
    tail = component or _SUFFIX.match(text, end)  # _SUFFIX matches the empty string too
    suffix = tail.group() if tail else ""
    end += len(suffix)
    if end < len(text) and text[end].isalnum():
        return None  # the number runs on into something else
    all_fixes = tuple(dict.fromkeys([*fixes, *serial_fixes, *fill_fixes]))
    number = NihNumber(activity, ic, serials, written, app_type, suffix or None, all_fixes)
    return number, end


def parse_nih(text: str, ics: frozenset[str]) -> tuple[NihNumber, ...]:
    """Every NIH number in one item, read left to right (docs/09 §6.2).

    A number starts at the start of a word. With an activity code - optionally after an
    application-type digit - the institute code follows it; without one ("bare"), the word
    starts with the institute code. `ics` is the configured list of two-letter codes, so
    `R21AO129851` (`AO` is not one) parses as nothing.
    """
    upper = normalise(text).upper()
    found: list[NihNumber] = []
    i = 0
    while i < len(upper):
        if not upper[i].isalnum() or (i > 0 and upper[i - 1].isalnum()):
            i += 1
            continue
        result = _full_at(upper, i, ics) or _bare_at(upper, i, ics)
        if result is None:
            i += 1
            continue
        number, end = result
        if not found and _digits_before(upper, i):
            number = _with_fix(number, "text before the number ignored")
        found.append(number)
        i = end
    return tuple(found)


def _full_at(text: str, i: int, ics: frozenset[str]) -> tuple[NihNumber, int] | None:
    head = _HEAD.match(text, i)
    if head is None or head.group(3) not in ics:
        return None
    activity, fixes = _fix_activity(head.group(2))
    return _finish(text, head.end(), activity=activity, ic=head.group(3), app_type=head.group(1), fixes=fixes)


def _bare_at(text: str, i: int, ics: frozenset[str]) -> tuple[NihNumber, int] | None:
    head = _BARE_HEAD.match(text, i)
    if head is None or head.group(1) not in ics:
        return None
    fixes: list[Fix] = ["bare serial"]
    if _garbled_before(text, i):
        fixes.append("garbled activity code ignored")
    return _finish(text, head.end(), activity=None, ic=head.group(1), app_type=None, fixes=fixes)


def _digits_before(text: str, i: int) -> bool:
    """Something with a digit before the number, such as the mechanism pair in `K99/R00 1K99…`.

    A label ("NIH", "#") is not: it has no digit.
    """
    return any(ch.isdigit() for ch in text[:i])


def _garbled_before(text: str, i: int) -> bool:
    """A word just before a bare number that looks like a mangled activity code (`PM50 GMO…`)."""
    word = re.search(r"([A-Z0-9]+)[ \-]*$", text[:i])
    if word is None:
        return False
    return any(ch.isdigit() for ch in word.group(1)) and word.group(1)[0].isalpha()


def _with_fix(number: NihNumber, fix: Fix) -> NihNumber:
    return NihNumber(
        number.activity,
        number.ic,
        number.serials,
        number.written,
        number.app_type,
        number.suffix,
        tuple(dict.fromkeys([*number.fixes, fix])),
    )


def is_normalised(fixes: Iterable[str]) -> bool:
    """Whether a parse needed a fix beyond case, spacing, labels, type and suffix (§8.3)."""
    return any(fix in NORMALISING for fix in fixes)


def near_miss(written: str, serial: str) -> bool:
    """§6.5 clause 1: `serial` is the written digits with one digit inserted, deleted or
    substituted, two digits exchanged (any two places), or more digits added at the end, each
    variant zero-filled to six.
    """
    if not written.isdigit() or len(serial) != SERIAL_DIGITS:
        return False
    return serial in _variants(written)


def _variants(written: str) -> set[str]:
    digits = "0123456789"
    n = len(written)
    variants: set[str] = set()
    for k in range(n + 1):
        variants.update(written[:k] + d + written[k:] for d in digits)
    for k in range(n):
        variants.add(written[:k] + written[k + 1 :])
        variants.update(written[:k] + d + written[k + 1 :] for d in digits if d != written[k])
    for a in range(n):
        for b in range(a + 1, n):
            chars = list(written)
            chars[a], chars[b] = chars[b], chars[a]
            variants.add("".join(chars))
    for extra in range(1, SERIAL_DIGITS + 1 - n):
        variants.update(written + str(tail).zfill(extra) for tail in range(10**extra))
    return {
        variant.zfill(SERIAL_DIGITS)
        for variant in variants
        if 0 < len(variant) <= SERIAL_DIGITS and variant != written
    }


# --- Contracts (§6.7) ------------------------------------------------------------------------

ContractKind = Literal["contract", "idiq", "task_order"]


@dataclass(frozen=True)
class Contract:
    number: str  # HHSN272201700059C, 75N93020F00001
    kind: ContractKind


_HHSN = re.compile(r"(?<![A-Z0-9])HHSN[ \-]*([0-9]{12})([A-Z])(?![A-Z0-9])")
_75N = re.compile(r"(?<![A-Z0-9])75N[ \-]*([0-9]{5})[ \-]*([A-Z])[ \-]*([0-9]{5})(?![A-Z0-9])")
# The letter in a contract number's ninth place says what it is (FAR 4.1603): D an indefinite-
# delivery contract, F an order under one. HHSN numbers end in I for an IDIQ.
_75N_KINDS: Mapping[str, ContractKind] = {"D": "idiq", "F": "task_order"}


def parse_contracts(text: str) -> tuple[Contract, ...]:
    """NIH contracts and task orders in one item.

    `HHSN…I` and `75N…D…` are indefinite-delivery (IDIQ) contracts, `75N…F…` an order under
    one; the rest are contracts.
    """
    upper = normalise(text).upper()
    found: list[tuple[int, Contract]] = []
    for match in _HHSN.finditer(upper):
        kind: ContractKind = "idiq" if match.group(2) == "I" else "contract"
        found.append((match.start(), Contract(f"HHSN{match.group(1)}{match.group(2)}", kind)))
    for match in _75N.finditer(upper):
        letter = match.group(2)
        number = f"75N{match.group(1)}{letter}{match.group(3)}"
        found.append((match.start(), Contract(number, _75N_KINDS.get(letter, "contract"))))
    return tuple(contract for _, contract in sorted(found, key=lambda pair: pair[0]))


def task_order_digits(task_order: str) -> str:
    """A task order as RePORTER writes it inside a project number: letters removed.

    `75N93020F00001` → `759302000001`, as in `272201700036I-0-759302000001-1`.
    """
    return "".join(ch for ch in task_order if ch.isdigit())


# --- Other agencies (§6.8-6.10) --------------------------------------------------------------


def strip_labels(text: str, prefixes: Sequence[str] = ()) -> str:
    """`text` without leading labels and the agency's configured prefixes, repeatedly.

    `FONDECYT grants 1210644` → `1210644`; `VR-RFI 2019-00217` → `2019-00217`. Prefixes are
    matched case-insensitively and must end at a word boundary or a separator, so `NRF` strips
    from `NRF-2016R1A5A1010764` but `ALTF` (not a prefix) stays on `ALTF 933-2015`.
    """
    ordered = sorted(prefixes, key=len, reverse=True)
    current = text.strip()
    while True:
        before = current
        label = _LABEL.match(current)
        if label and label.end() < len(current):
            current = current[label.end() :].lstrip(" #:-/")
        for prefix in ordered:
            if current.upper().startswith(prefix.upper()) and len(current) > len(prefix):
                rest = current[len(prefix) :]
                if not rest[0].isalnum() or not prefix[-1].isalnum() or rest[0].isdigit():
                    current = rest.lstrip(" #:-/")
                    break
        if current == before:
            return current


def expand_year(text: str, data_year: int) -> str:
    """A number that begins with a two-digit year, expanded to four (FAPESP, §6.10).

    `16/00696-3` → `2016/00696-3`: `20YY`, or `19YY` when `20YY` would be after the data year.
    A number that already begins with four digits is left alone.
    """
    match = re.match(r"^([0-9]{2})(?=[/\-. ])", text)
    if match is None:
        return text
    year = 2000 + int(match.group(1))
    if year > data_year:
        year -= 100
    return f"{year}{text[2:]}"


def agency_number(
    text: str,
    prefixes: Sequence[str] = (),
    *,
    year_prefix: bool = False,
    data_year: int,
    drop_sub_award: bool = False,
) -> str:
    """The key segment of another agency's number (§6.9, §6.10): uppercase letters and digits
    after labels and the agency's prefixes are stripped (`VR-RFI 2019-00217` → `201900217`).

    US federal numbers drop a sub-award suffix (`NNX16AO69A:0061` → `NNX16AO69A`, TRISH).
    """
    stripped = strip_labels(clean(text), prefixes)
    if drop_sub_award:
        stripped = _SUB_AWARD.sub("", stripped)
    if year_prefix:
        stripped = expand_year(stripped, data_year)
    return alnum(stripped)


def nsf_number(text: str, prefixes: Sequence[str] = ()) -> str | None:
    """Seven digits once separators and the division prefix are removed, or None (§6.8).

    `NSF OCE-0939564`, `DBI-193331.1` and `DGE-214-0004` all give seven digits. Six digits
    (`OPP 144374`) are not an NSF number: NSF's numbers have seven, and a guess at the missing
    one is a grant override's to make.
    """
    stripped = strip_labels(clean(text), prefixes)
    stripped = re.sub(r"^[A-Za-z][A-Za-z \-]*?(?=[0-9])", "", stripped)
    digits = re.sub(r"[ \-.]", "", stripped)
    return digits if len(digits) == NSF_DIGITS and digits.isdigit() else None


def swap_variants(number: str) -> tuple[str, ...]:
    """Every number one O↔0 or I↔1 swap away (§6.9: `NA140AR4170078` ↔ `NA14OAR4170078`)."""
    swaps = {"O": "0", "0": "O", "I": "1", "1": "I"}
    return tuple(number[:k] + swaps[ch] + number[k + 1 :] for k, ch in enumerate(number) if ch in swaps)


def fragments(numbers: Iterable[str]) -> dict[str, tuple[str, ...]]:
    """The numbers of one agency on one work that are fragments of others (§6.10).

    A number that is a proper prefix or suffix, of at least three characters, of another is a
    fragment of it, and lists the longest number it is part of (every one, if several tie), and
    that number's own whole if it is a fragment too. `HDTRA1` and `HDTRA118` beside
    `HDTRA11810001` list `HDTRA11810001`; `ANR10` beside `ANR10IAHU0001` and `ANR10IAHU01` lists
    the first. Numbers that are no fragment are left out.
    """
    distinct = sorted(set(numbers))
    direct: dict[str, tuple[str, ...]] = {}
    for number in distinct:
        if len(number) < SHORTEST_FRAGMENT:
            continue
        longer = [
            other
            for other in distinct
            if other != number and (other.startswith(number) or other.endswith(number))
        ]
        if longer:
            longest = max(len(other) for other in longer)
            direct[number] = tuple(other for other in longer if len(other) == longest)

    def wholes(number: str) -> set[str]:
        return set().union(*(wholes(part) for part in direct[number])) if number in direct else {number}

    return {number: tuple(sorted(wholes(number))) for number in direct}


def grant_key(*segments: str) -> str:
    """A key from its family and segments, checked against the grammar."""
    key = ":".join(segments)
    if not GRANT_KEY.fullmatch(key):
        raise ValueError(f"not a grant key: {key!r}")
    return key


def misc_key(number: str) -> str | None:
    """`MISC:<NUMBER>`, or None when the item has no letter or digit to key it by."""
    segment = alnum(number)
    return grant_key(MISC, segment) if segment else None


def phase_partners(pairs: Iterable[Sequence[str]]) -> Mapping[str, frozenset[str]]:
    """Each activity code's configured phase partners (§6.3): `R33` → `{R21, R61}`."""
    partners: dict[str, set[str]] = {}
    for first, second in pairs:
        partners.setdefault(first, set()).add(second)
        partners.setdefault(second, set()).add(first)
    return {code: frozenset(codes) for code, codes in partners.items()}
