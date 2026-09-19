"""UWPR's own publications pages — channel A and rule R1 (Phase 1 §5, docs/03 §5 stage 1).

The pages are `<li><b>title</b> authors <i>journal</i> date <a>PMID</a></li>` under a year
heading. An entry's key uses that heading ("2026", or `older` for the page of earlier years) and
not the URL, so entries keep their identity when the current year moves to its own page.
"""

import hashlib
import re
import unicodedata
from dataclasses import dataclass, field
from html.parser import HTMLParser

from uwpr_pubs.http import HttpClient, Policy

HEADINGS = ("h1", "h2", "h3", "h4")
YEAR = re.compile(r"^(19|20)[0-9]{2}$")
PUBMED_ID = re.compile(r"pubmed[^\"']*?/([0-9]+)")


def normalise_title(title: str) -> str:
    text = unicodedata.normalize("NFKC", title).lower()
    return re.sub(r"[^a-z0-9 ]+", "", text).strip()


def page_label(heading: str) -> str:
    """ "2026" stays 2026; "2021 and Previous Years" is the `older` page."""
    words = heading.strip().split()
    if words and YEAR.match(words[0]) and len(words) == 1:
        return words[0]
    return "older"


def entry_key(page: str, title: str) -> str:
    digest = hashlib.sha1(normalise_title(title).encode("utf-8")).hexdigest()[:12]  # noqa: S324
    return f"list:{page}:{digest}"


@dataclass
class RawEntry:
    page: str
    title: str
    authors_text: str
    venue_text: str
    pmid: str | None
    links: list[str] = field(default_factory=list)

    @property
    def key(self) -> str:
        return entry_key(self.page, self.title)


class _ListParser(HTMLParser):
    """Collects list items, tagging their parts by the element they sit in."""

    def __init__(self, default_page: str) -> None:
        super().__init__(convert_charrefs=True)
        self.entries: list[RawEntry] = []
        self._page = default_page
        self._heading: list[str] | None = None
        self._depth = 0
        self._stack: list[str] = []
        self._title: list[str] = []
        self._venue: list[str] = []
        self._rest: list[str] = []
        self._links: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in HEADINGS:
            self._heading = []
        elif tag == "li":
            self._depth += 1
            if self._depth == 1:
                self._stack, self._title, self._venue, self._rest, self._links = [], [], [], [], []
        elif self._depth:
            self._stack.append(tag)
            if tag == "a":
                href = dict(attrs).get("href")
                if href:
                    self._links.append(href)

    def handle_endtag(self, tag: str) -> None:
        if tag in HEADINGS and self._heading is not None:
            self._page = page_label("".join(self._heading))
            self._heading = None
        elif tag == "li":
            if self._depth == 1:
                self._finish()
            self._depth = max(0, self._depth - 1)
        elif self._depth and tag in self._stack:
            self._stack.reverse()
            self._stack.remove(tag)
            self._stack.reverse()

    def handle_data(self, data: str) -> None:
        if self._heading is not None:
            self._heading.append(data)
        elif self._depth:
            if "b" in self._stack or "strong" in self._stack:
                self._title.append(data)
            elif "i" in self._stack or "em" in self._stack:
                self._venue.append(data)
            else:
                self._rest.append(data)

    def _finish(self) -> None:
        title = " ".join("".join(self._title).split())
        if not title:
            return  # navigation and other lists have no bold title
        rest = "".join(self._rest)
        authors = " ".join(rest.split("\n")[0].split()) if rest else ""
        pmid = next((m.group(1) for link in self._links if (m := PUBMED_ID.search(link))), None)
        self.entries.append(
            RawEntry(
                page=self._page,
                title=title,
                authors_text=authors.strip(" .,;"),
                venue_text=" ".join("".join(self._venue).split()),
                pmid=pmid,
                links=list(self._links),
            )
        )


def parse_page(html: str, default_page: str = "older") -> list[RawEntry]:
    parser = _ListParser(default_page)
    parser.feed(html)
    parser.close()
    return parser.entries


def page_links(index_html: str, pattern: str, base: str) -> list[str]:
    """Links from the index to the year pages and the `older` page."""
    matcher = re.compile(pattern)
    hrefs = re.findall(r"href=[\"']([^\"']+)[\"']", index_html)
    links: list[str] = []
    for href in hrefs:
        absolute = href if href.startswith("http") else base.rstrip("/").rsplit("/publications", 1)[0] + href
        if (matcher.match(href) or matcher.match(absolute)) and absolute not in links:
            links.append(absolute)
    return links


class UwprSite:
    def __init__(self, client: HttpClient, index_url: str, link_pattern: str) -> None:
        self.client = client
        self.index_url = index_url
        self.link_pattern = link_pattern

    def fetch(self) -> list[tuple[str, str]]:
        """The index page and every page it links to, as (url, html)."""
        index = self.client.get(self.index_url, host="uwpr_site", policy=Policy.REFRESH)
        pages = [(self.index_url, index.text)]
        for url in page_links(index.text, self.link_pattern, self.index_url):
            if url.rstrip("/") == self.index_url.rstrip("/"):
                continue
            reply = self.client.get(url, host="uwpr_site", policy=Policy.REFRESH)
            pages.append((url, reply.text))
        return pages

    def entries(self) -> list[tuple[str, RawEntry]]:
        """Every parsed entry, with the URL it came from."""
        found: list[tuple[str, RawEntry]] = []
        for url, html in self.fetch():
            default = "older" if url.rstrip("/").endswith("older") else "current"
            found.extend((url, entry) for entry in parse_page(html, default))
        return found
