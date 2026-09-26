"""Stage 8b, the funding stage, over whole runs, offline (docs/09 §9, §14's "Stage" bullet).

The corpus is four papers, three of them on the official list, each listing grants the way the
real ones do (docs/09 Appendix A): an exact NIH number in three sources and in JATS, the resource
code, a DOE facility contract, an antibody name, an NSF award, a near-miss NIH links the paper to
and the same near-miss on a paper it does not, a typo an override resolves, a Wellcome grant
valued by OpenAlex in pounds, a NASA award valued by USAspending, and a funder no agency is
configured for. The fourth paper is off the list, included by the award code alone, so an
override can take it out.

Every source is a fake: RePORTER, NSF, USAspending, OpenAlex's awards and funders, PubMed,
Crossref's funders and PMC. Every RePORTER request the stage sends is checked as it is sent —
sorted, and a project search excluding sub-projects (docs/09 §5.1).
"""

import datetime as dt
import json
import shutil
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pytest
import yaml

from uwpr_pubs import pipeline as pipeline_module
from uwpr_pubs.cache import Cache
from uwpr_pubs.config import load_config
from uwpr_pubs.context import RunContext
from uwpr_pubs.funding.amounts import value_grant
from uwpr_pubs.funding.jats import FundingString as JatsString
from uwpr_pubs.http import Budget, HttpClient, Mode, RateLimiter, Response
from uwpr_pubs.pipeline import RunOptions, RunResult, run_pipeline
from uwpr_pubs.stages import funding as stage_module
from uwpr_pubs.stages.export import build_from_store, export_dir, resource_block
from uwpr_pubs.stages.export import read as read_export
from uwpr_pubs.stages.funding import contract_key, in_window, jats_sightings, openalex_sightings
from uwpr_pubs.store import io
from uwpr_pubs.validate import validate_store

PROJECT = Path(__file__).resolve().parents[1]
INDEX = "https://proteomicsresource.washington.edu/publications/"
REPORTER = "https://api.reporter.nih.gov/v2/"
NSF_API = "https://api.nsf.gov/services/v1/awards.json"
USASPENDING = "https://api.usaspending.gov/api/v2/"

# 2026-10-03 is a Saturday, inside RePORTER's window; 2026-10-05 a Monday.
SATURDAY = "2026-10-03T12:00:00+00:00"
WEEK_LATER = "2026-10-10T12:00:00+00:00"
MONDAY_MORNING = "2026-11-02T15:00:00+00:00"  # 10:00 in New York, 30 days on: a full refresh is due
MONDAY_NIGHT = "2026-11-03T03:00:00+00:00"  # 22:00 in New York the same evening: inside the window

NIH_FUNDER = "https://openalex.org/F4320332161"
NSF_FUNDER = "https://openalex.org/F4320306076"
WELLCOME = "https://openalex.org/F4320311904"
NASA = "https://openalex.org/F4320306101"
UW = "https://openalex.org/F4320310094"
UNCONFIGURED = "https://openalex.org/F4320399999"


@dataclass(frozen=True)
class Paper:
    number: int
    pmid: str
    doi: str
    listed: bool
    awards: tuple[tuple[str, str | None, str | None], ...]  # (string, funder ID, award ID)
    pmcid: str | None = None


def award(raw: str, funder: str | None, gid: str | None = None) -> tuple[str, str | None, str | None]:
    return (raw, funder, f"https://openalex.org/{gid}" if gid else None)


A = Paper(
    1,
    "10000001",
    "10.1234/a",
    True,
    (
        award("R01 GM086688", NIH_FUNDER, "G1"),
        award("UWPR95794", UW, "G2"),
        award("DE-AC05-76RL01830", "https://openalex.org/F4320306084", "G3"),
        award("PGT121", None, "G4"),
        award("1443474", NSF_FUNDER, "G5"),
    ),
    pmcid="PMC2000001",
)
B = Paper(
    2,
    "10000002",
    "10.1234/b",
    True,
    (award("P01 HL09296", NIH_FUNDER, "G8"), award("R01 GM12345", NIH_FUNDER, "G9")),
)
C = Paper(
    3,
    "10000003",
    "10.1234/c",
    True,
    (
        award("U19AG02312", NIH_FUNDER, "G10"),
        award("WT 092809/Z/10/Z", WELLCOME, "G6"),
        award("NNX14AJ87G", NASA, "G11"),
        award("P01 HL09296", NIH_FUNDER, "G12"),
        award("SFE-2018-0099", UNCONFIGURED, "G7"),
    ),
)
D = Paper(
    4, "10000004", "10.1234/d", False, (award("UWPR95794", UW, "G13"), award("R21 AI123456", NIH_FUNDER))
)
PAPERS = (A, B, C, D)

LINKS = {A.pmid: ["R01GM086688"], B.pmid: ["P01HL092969"], D.pmid: ["R21AI123456"]}
# Contracts, as RePORTER holds them: no HHSN prefix, and the core truncated to 11 characters. An
# IDIQ's task orders are rows of their own, the order's digits the third part (docs/09 §5.1).
CONTRACT_ROWS = [
    ("272201700059C-0-0-1", 5_500_001, 2018, 5_000_000),
    ("272201700059C-0-0-2", 5_500_002, 2019, 4_000_000),
    ("272201700036I-0-759302000001-1", 5_600_001, 2020, 900_000),
    ("272201700036I-P00004-759302000001-1", 5_600_002, 2021, 571_125),
    ("272201700036I-0-759302000002-1", 5_600_003, 2021, 2_000_000),  # another order: never counted
]
# RePORTER's held cores: (institute, its name, the last fiscal year, the project's end).
HELD = {
    "R01GM086688": ("NIGMS", "National Institute of General Medical Sciences", 2026, "2027-03-31"),
    "P30DK017047": (
        "NIDDK",
        "National Institute of Diabetes and Digestive and Kidney Diseases",
        2021,
        "2021-11-30",
    ),
    "P01HL092969": ("NHLBI", "National Heart, Lung, and Blood Institute", 2019, "2019-06-30"),
    "U19AG023122": ("NIA", "National Institute on Aging", 2012, "2012-06-30"),
    "R21AI123456": ("NIAID", "National Institute of Allergy and Infectious Diseases", 2020, "2020-06-30"),
}
PUBMED = {A.pmid: [("R01 GM086688", "NIGMS NIH HHS")], B.pmid: [("P01 HL09296", "NHLBI NIH HHS")]}
CROSSREF = {
    A.doi: [{"DOI": "10.13039/100000001", "name": "National Science Foundation", "award": ["1443474"]}]
}
JATS = """<article><front><article-meta><funding-group><award-group><funding-source><institution-wrap>
<institution>National Institute of General Medical Sciences</institution>
<institution-id institution-id-type="FundRef">http://dx.doi.org/10.13039/100000057</institution-id>
</institution-wrap></funding-source><award-id>R01 GM086688</award-id></award-group></funding-group>
</article-meta></front><body><sec><title>Results</title><p>The experiment worked.</p></sec></body>
<back><ack><p>This work was also supported by grant P30 DK017047 from NIDDK.</p></ack></back></article>"""
OPENALEX_AWARDS = {
    "G5": {"amount": 400430.0, "currency": "USD", "provenance": "nsf_award_search", "start_year": 2015},
    "G6": {"amount": 1000000, "currency": "GBP", "provenance": "wellcome_trust", "start_year": 2010,
           "end_year": 2015, "display_name": "SAMPLE: A consortium"},
    "G7": {"amount": 500000, "currency": "CNY", "provenance": "crossref", "start_year": 2018},
}  # fmt: skip
USASPENDING_AWARDS = {"NNX14AJ87G": "ASST_NON_NNX14AJ87G_8000"}


# --- the fake sources ------------------------------------------------------------------------------


def openalex_work(paper: Paper) -> dict[str, Any]:
    return {
        "id": f"https://openalex.org/W{paper.number}",
        "doi": f"https://doi.org/{paper.doi}",
        "ids": {
            "openalex": f"https://openalex.org/W{paper.number}",
            "doi": f"https://doi.org/{paper.doi}",
            "pmid": f"https://pubmed.ncbi.nlm.nih.gov/{paper.pmid}",
        },
        "display_name": f"Example work {paper.number}",
        "publication_date": f"2023-05-0{paper.number}",
        "publication_year": 2023,
        "type": "article",
        "primary_location": {"source": {"display_name": "J Example", "issn_l": "1234-5678"}},
        "authorships": [],
        "topics": [],
        "open_access": {"oa_status": "gold"},
        "best_oa_location": {},
        "is_retracted": False,
        "cited_by_count": paper.number,
        "counts_by_year": [],
        "fwci": None,
        "citation_normalized_percentile": {},
        "awards": [
            {"id": gid, "display_name": None, "funder_award_id": raw, "funder_id": funder,
             "funder_display_name": "A funder" if funder else None}
            for raw, funder, gid in paper.awards
        ],
    }  # fmt: skip


def list_page() -> str:
    items = "".join(
        f"<li><b>Listed paper {p.number}.</b> Eng JK. <i>J Example.</i> 2023 Oct {p.number}."
        f' <a href="https://pubmed.ncbi.nlm.nih.gov/{p.pmid}/">PMID: {p.pmid}</a></li>'
        for p in PAPERS
        if p.listed
    )
    return f"<html><body><main><h3>2023</h3><ul>{items}</ul></main></body></html>"


def contract_row(project_num: str, appl_id: int, year: int, amount: int) -> dict[str, Any]:
    return {
        "appl_id": appl_id,
        "fiscal_year": year,
        "project_num": project_num,
        "core_project_num": project_num.replace("-", "")[:11],
        "subproject_id": None,
        "award_amount": amount,
        "agency_code": "NIH",
        "agency_ic_admin": {"code": "AI", "abbreviation": "NIAID", "name": "National Institute of Allergy"},
        "organization": {"org_name": "SAMPLE CONTRACTOR"},
        "principal_investigators": [],
        "project_title": "SAMPLE: CONTRACT",
        "project_start_date": f"{year}-01-01T00:00:00",
        "project_end_date": f"{year}-12-31T00:00:00",
    }


def reporter_rows(core: str) -> list[dict[str, Any]]:
    """Two parent rows a fiscal year apart, and (for the centre) a sub-project row never added."""
    ic, name, last, end = HELD[core]
    index = sorted(HELD).index(core)
    rows: list[dict[str, Any]] = [
        {
            "appl_id": 9_000_000 + 10 * index + number,
            "fiscal_year": last - 1 + number,
            "project_num": f"5{core}-0{number + 1}",
            "core_project_num": core,
            "subproject_id": None,
            "award_amount": 300_000 + 1_000 * number,
            "agency_code": "NIH",
            "agency_ic_admin": {"code": core[3:5], "abbreviation": ic, "name": name},
            "organization": {"org_name": "UNIVERSITY OF WASHINGTON"},
            "principal_investigators": [{"profile_id": 1000001 + index, "full_name": f"SAMPLE PI {index}"}],
            "project_title": f"SAMPLE: {core}",
            "project_start_date": "2015-04-01T00:00:00",
            "project_end_date": f"{end}T00:00:00",
        }
        for number in range(2)
    ]
    if core.startswith("P30"):
        rows.append(
            {**rows[0], "appl_id": rows[0]["appl_id"] + 5, "subproject_id": "7829", "award_amount": 123}
        )
    return rows


@dataclass
class World:
    """The sources, with knobs a test can turn between runs."""

    reporter_status: int = 200
    reporter_shape: bool = True  # False: rows without a fiscal year
    nsf_funder: str | None = NSF_FUNDER  # the funder OpenAlex names for 1443474
    papers: tuple[Paper, ...] = PAPERS
    links: dict[str, list[tuple[str, int]]] = field(
        default_factory=lambda: {pmid: [(core, 7_000_000) for core in cores] for pmid, cores in LINKS.items()}
    )
    contracts: bool = False  # whether RePORTER holds CONTRACT_ROWS
    down: frozenset[str] = frozenset()  # sighting sources answering 503: "pubmed", "crossref"
    crossref_funders: dict[str, list[dict[str, Any]]] = field(default_factory=lambda: dict(CROSSREF))
    openalex_awards: dict[str, dict[str, Any]] = field(default_factory=lambda: dict(OPENALEX_AWARDS))
    sent: list[tuple[str, str, dict[str, str], Any]] = field(default_factory=list)

    def route(self, method: str, url: str, params: Mapping[str, str], body: Any) -> Response:  # noqa: PLR0911, PLR0912
        if url.startswith(REPORTER):
            return self.reporter(url, body)
        if url.startswith(NSF_API):
            return self.nsf(params["id"])
        if url.startswith(USASPENDING):
            return self.usaspending(url, body)
        if url.startswith(INDEX) and url.rstrip("/").endswith("publications"):
            return Response(url, 200, b'<a href="/publications/2023/">2023</a>', {})
        if "publications/2023" in url:
            return Response(url, 200, list_page().encode(), {"content-type": "text/html"})
        if "api.openalex.org/authors" in url:
            return json_reply({"results": [], "meta": {}})
        if "api.openalex.org/awards" in url:
            wanted = [gid.rsplit("/", 1)[-1] for gid in params["filter"].removeprefix("id:").split("|")]
            awards = self.openalex_awards
            found = [{"id": f"https://openalex.org/{gid}", **awards[gid]} for gid in wanted if gid in awards]
            return json_reply({"results": found, "meta": {}})
        if "api.openalex.org/funders" in url:
            found = [{"id": UNCONFIGURED, "display_name": "Sample Foundation", "country_code": "de"}]
            return json_reply({"results": found if "F4320399999" in params["filter"] else [], "meta": {}})
        if "api.openalex.org/works" in url:
            return json_reply(
                {"results": self.works(params.get("filter", "")), "meta": {"next_cursor": None}}
            )
        if "idconv" in url:
            wanted = params.get("ids", "").split(",")
            return json_reply(
                {
                    "records": [
                        {"pmid": p.pmid, "pmcid": p.pmcid} for p in PAPERS if p.pmid in wanted and p.pmcid
                    ]
                }
            )
        if "efetch.fcgi" in url:
            if params.get("db") == "pubmed" and "pubmed" in self.down:
                return Response(url, 503, b"", {})
            if params.get("db") == "pubmed":
                return Response(url, 200, pubmed_xml(params["id"].split(",")).encode(), {})
            xml = JATS if params.get("id") == "2000001" else "<article/>"
            return Response(url, 200, xml.encode(), {"content-type": "application/xml"})
        if "api.crossref.org" in url:
            return self.crossref(params)
        if "ebi.ac.uk" in url:
            return json_reply({"resultList": {"result": []}, "nextCursorMark": ""})
        raise AssertionError(f"unexpected request: {method} {url}")

    def works(self, expression: str) -> list[dict[str, Any]]:
        payloads = [openalex_work(paper) for paper in self.papers]
        for payload in payloads:
            for item in payload["awards"]:
                if item["funder_award_id"] == "1443474":
                    item["funder_id"] = self.nsf_funder
        if "awards.funder_award_id:UWPR95794" in expression:
            return [p for p in payloads if any(a["funder_award_id"] == "UWPR95794" for a in p["awards"])]
        field_name, _, values = expression.partition(":")
        if field_name not in ("pmid", "doi", "openalex_id"):
            return []
        wanted = [value for value in values.split("|") if value]
        return [p for p in payloads if any(v in f"{p['id']} {p['doi']} {p['ids']['pmid']}" for v in wanted)]

    def crossref(self, params: Mapping[str, str]) -> Response:
        if params.get("select") == "DOI,funder" and "crossref" in self.down:
            return Response("u", 503, b"", {})
        if params.get("select") != "DOI,funder":
            return json_reply({"message": {"items": [], "next-cursor": None}})
        dois = [part.removeprefix("doi:") for part in params["filter"].split(",")]
        items = [{"DOI": doi, "funder": self.crossref_funders.get(doi, [])} for doi in dois]
        return json_reply({"message": {"items": items}})

    def reporter(self, url: str, body: Any) -> Response:
        # docs/09 §5.1: every request sorted, and every project search without sub-projects.
        assert body["sort_order"] == "asc" and body["limit"] <= 500
        if url.endswith("publications/search"):
            assert body["sort_field"] == "coreproject"
        else:
            assert body["sort_field"] == "appl_id"
            assert body["criteria"]["exclude_subprojects"] is True
            assert "AbstractText" not in body["include_fields"] and "PhrText" not in body["include_fields"]
        if self.reporter_status != 200:
            return Response(url, self.reporter_status, b"", {})
        criteria = body["criteria"]
        if url.endswith("publications/search"):
            rows = [
                {"pmid": int(pmid), "coreproject": core, "applid": applid}
                for pmid in map(str, criteria["pmids"])
                for core, applid in self.links.get(pmid, [])
            ]
        elif "project_nums" in criteria:
            prefixes = [number.rstrip("*") for number in criteria["project_nums"]]
            rows = [
                row
                for core in sorted(HELD)
                if any(core.startswith(prefix) for prefix in prefixes)
                for row in reporter_rows(core)
            ]
            contracts = [contract_row(*values) for values in CONTRACT_ROWS] if self.contracts else []
            rows += [
                row
                for row in contracts
                if any(
                    row["project_num"].startswith(prefix) or row["core_project_num"] == prefix
                    for prefix in prefixes
                )
            ]
        else:
            split = criteria["project_num_split"]
            rows = [
                row
                for core in sorted(HELD)
                if core[3:5] == split.get("ic_code") and core[5:] == split.get("serial_num")
                for row in reporter_rows(core)
            ]
        if not self.reporter_shape:
            rows = [{key: value for key, value in row.items() if key != "fiscal_year"} for row in rows]
        offset, limit = body["offset"], body["limit"]
        return json_reply({"meta": {"total": len(rows)}, "results": rows[offset : offset + limit]})

    def nsf(self, award_id: str) -> Response:
        known = {
            "id": "1443474",
            "title": "SAMPLE: Collaborative Research",
            "awardeeName": "UNIVERSITY OF WASHINGTON",
            "estimatedTotalAmt": "400430",
            "fundsObligatedAmt": "400430",
            "startDate": "07/01/2015",
            "expDate": "06/30/2020",
            "fundProgramName": "ANT Ocean & Atmos Sciences",
            "transType": "Standard Grant",
            "pdPIName": "SAMPLE Investigator G",
            "abstractText": "never kept",
        }
        found = [known] if award_id == known["id"] else []
        return json_reply({"response": {"award": found}})

    def usaspending(self, url: str, body: Any) -> Response:
        if url.endswith("spending_by_award/"):
            ids = body["filters"]["award_ids"]
            rows = [
                {"Award ID": i, "generated_internal_id": USASPENDING_AWARDS[i]}
                for i in ids
                if i in USASPENDING_AWARDS
            ]
            return json_reply({"results": rows, "page_metadata": {"hasNext": False}})
        generated = url.rstrip("/").rsplit("/", 1)[-1]
        return json_reply({
            "generated_unique_award_id": generated, "total_obligation": 796089.19, "type": "04",
            "period_of_performance": {"start_date": "2014-05-01", "end_date": "2018-04-30"},
            "recipient": {"recipient_name": "SAMPLE UNIVERSITY"},
        })  # fmt: skip


def json_reply(payload: object) -> Response:
    return Response("u", 200, json.dumps(payload).encode(), {"content-type": "application/json"})


def pubmed_xml(pmids: list[str]) -> str:
    articles = "".join(
        f"<PubmedArticle><MedlineCitation><PMID>{pmid}</PMID><Article><GrantList CompleteYN='Y'>"
        + "".join(
            f"<Grant><GrantID>{g}</GrantID><Agency>{a}</Agency></Grant>" for g, a in PUBMED.get(pmid, [])
        )
        + "</GrantList></Article></MedlineCitation></PubmedArticle>"
        for pmid in pmids
    )
    return f"<PubmedArticleSet>{articles}</PubmedArticleSet>"


def client_for(world: World, cache: Path) -> HttpClient:
    def transport(
        url: str,
        params: Mapping[str, str],
        headers: Mapping[str, str],
        timeout: float,
        *,
        method: str = "GET",
        body: bytes | None = None,
    ) -> Response:
        parsed = None if body is None else json.loads(body)
        world.sent.append((method, url, dict(params), parsed))
        return world.route(method, url, params, parsed)

    return HttpClient(
        contact="mriffle@uw.edu",
        user_agent="uwpr-pubs/test",
        mode=Mode.LIVE,
        cache=Cache(cache),
        budget=Budget(max_run_usd=0.5, min_remaining_usd=0.1),
        rate_limiter=RateLimiter({}),
        transport=transport,
        sleep=lambda _: None,
        now=lambda: "2026-10-03T00:00:00Z",
    )


# --- running --------------------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _no_real_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(pipeline_module, "api_keys", lambda: (None, None))


def funding_config(tmp_path: Path, **funding: Any) -> Path:
    """The project's config with funding enabled, at a version of its own, as B9 will make it."""
    directory = tmp_path / f"config-{len(list(tmp_path.glob('config-*')))}"
    shutil.copytree(PROJECT / "config", directory)
    path = directory / "funding.yaml"
    document = yaml.safe_load(path.read_text(encoding="utf-8"))
    document.update({"enabled": True, "funding_version": "2099-01-01.1", **funding})
    path.write_text(yaml.safe_dump(document, sort_keys=False, allow_unicode=True), encoding="utf-8")
    return directory


def overrides_file(tmp_path: Path, *entries: str) -> Path:
    path = tmp_path / f"overrides-{len(list(tmp_path.glob('overrides-*')))}.yaml"
    path.write_text("".join(entries), encoding="utf-8")
    return path


def override(target: str, action: str, extra: str = "") -> str:
    return (
        f"- target: {target}\n  action: {action}\n{extra}"
        "  reason: 'Checked by hand.'\n  by: mriffle\n  date: 2026-10-01\n"
    )


@dataclass
class Runner:
    tmp_path: Path
    world: World = field(default_factory=World)
    config: Path | None = None
    overrides: Path | None = None
    runs: int = 0

    @property
    def store(self) -> Path:
        return self.tmp_path / "store"

    def __call__(self, when: str = SATURDAY, **options: Any) -> RunResult:
        self.runs += 1
        started = dt.datetime.fromisoformat(when)
        context = RunContext(
            today=started.astimezone(dt.UTC).date(), started=started, mode="live", store=self.store
        )
        config = load_config(
            config_dir=self.config or funding_config(self.tmp_path), overrides_path=self.overrides
        )
        client = client_for(self.world, self.tmp_path / f"cache-{self.runs}")  # cold, as on CI
        return run_pipeline(
            config, client, context, RunOptions(store=self.store, check_clean=False, **options)
        )

    def funding(self) -> dict[str, bytes]:
        directory = self.store / "funding"
        return (
            {path.name: path.read_bytes() for path in sorted(directory.iterdir())}
            if directory.is_dir()
            else {}
        )

    def lines(self) -> dict[str, dict[str, Any]]:
        return {line["work"]: line for line in io.read_jsonl(self.store / "funding" / "citations.jsonl")}

    def grants(self) -> dict[str, dict[str, Any]]:
        return {grant["key"]: grant for grant in io.read_jsonl(self.store / "funding" / "grants.jsonl")}

    def work(self, paper: Paper) -> str:
        return str(io.read_json(self.store / "aliases.json")["aliases"][f"pmid:{paper.pmid}"])

    def strings(self, paper: Paper) -> dict[str, dict[str, Any]]:
        return {string["raw"]: string for string in self.lines()[self.work(paper)]["strings"]}

    def manifest(self, result: RunResult) -> dict[str, Any]:
        return dict(io.read_json(self.store / "runs" / f"{result.run_id}.json"))

    def asked(self, host: str) -> list[tuple[str, str, dict[str, str], Any]]:
        return [sent for sent in self.world.sent if host in sent[1]]


@pytest.fixture
def run(tmp_path: Path) -> Runner:
    return Runner(tmp_path)


@pytest.fixture
def seeded(run: Runner) -> Runner:
    """A store after one full refresh, on a Saturday."""
    result = run()
    assert result.status == "ok", (result.errors, result.report)
    run.world.sent.clear()
    return run


# --- the first run: every kind of string ------------------------------------------------------------


def test_a_first_run_is_a_full_refresh_and_the_store_validates(seeded: Runner) -> None:
    manifest = seeded.manifest(_latest(seeded))
    assert manifest["funding"]["mode"] == "full"
    assert manifest["funding"]["grants"] == len(seeded.grants())
    assert validate_store(seeded.store).errors == []
    assert set(seeded.lines()) == {seeded.work(paper) for paper in PAPERS}


def _latest(runner: Runner) -> RunResult:
    run_id = sorted(path.stem for path in (runner.store / "runs").glob("*.json"))[-1]
    return RunResult("ok", run_id, "", True)


def test_an_exact_number_in_every_source_is_one_string(seeded: Runner) -> None:
    string = seeded.strings(A)["R01 GM086688"]
    assert string["sources"] == ["jats", "openalex", "pubmed"]
    assert (string["outcome"], string["method"], string["grants"]) == ("grant", "exact", ["NIH:R01GM086688"])
    assert "NIGMS NIH HHS" in string["funders"]  # PubMed's agency is shown among the funders
    prose = seeded.strings(A)["P30 DK017047"]  # JATS prose: a full-format number, and no funder
    assert (prose["sources"], prose["funders"], prose["grants"]) == (["jats"], [], ["NIH:P30DK017047"])
    assert seeded.lines()[seeded.work(A)]["jats_checked"] == {_pmc_record(seeded): "2026-10-03"}


def _pmc_record(runner: Runner) -> str:
    work = io.read_json(runner.store / "works" / f"{runner.work(A)}.json")
    return next(str(record["id"]) for record in work["records"] if record["ids"].get("pmcid"))


def test_the_resource_code_is_never_a_grant(seeded: Runner) -> None:
    string = seeded.strings(A)["UWPR95794"]
    assert (string["outcome"], string["method"], string["grants"]) == ("resource_code", None, [])
    assert not [key for key in seeded.grants() if "UWPR95794" in key.replace("-", "")]
    assert seeded.strings(D)["UWPR95794"]["outcome"] == "resource_code"


def test_facility_contracts_and_not_grants_are_excluded(seeded: Runner) -> None:
    facility, antibody = seeded.strings(A)["DE-AC05-76RL01830"], seeded.strings(A)["PGT121"]
    assert (facility["outcome"], facility["grants"]) == ("facility_contract", [])
    assert (antibody["outcome"], antibody["grants"]) == ("not_a_grant", [])
    assert not [key for key in seeded.grants() if "AC0576" in key or "PGT" in key]


def test_a_near_miss_is_accepted_only_when_nih_links_the_paper(seeded: Runner) -> None:
    linked, unlinked = seeded.strings(B)["P01 HL09296"], seeded.strings(C)["P01 HL09296"]
    assert (linked["outcome"], linked["method"], linked["grants"]) == (
        "grant",
        "corrected",
        ["NIH:P01HL092969"],
    )
    assert (unlinked["outcome"], unlinked["grants"]) == ("unresolved", ["MISC:P01HL09296"])
    assert seeded.grants()["MISC:P01HL09296"]["agency"] == "MISC"
    no_link = seeded.strings(B)["R01 GM12345"]  # not held, and no link to correct it by
    assert (no_link["outcome"], no_link["grants"]) == ("unresolved", ["MISC:R01GM12345"])


def test_a_grant_override_resolves_a_typo(tmp_path: Path) -> None:
    runner = Runner(tmp_path)
    runner()  # to learn the work's ID
    runner.overrides = overrides_file(
        tmp_path, override(runner.work(C), "grant", "  raw: U19AG02312\n  grant: NIH:U19AG023122\n")
    )
    result = runner(WEEK_LATER, funding="full")
    assert result.status == "ok", result.errors
    string = runner.strings(C)["U19AG02312"]
    assert (string["outcome"], string["method"], string["grants"]) == (
        "grant",
        "override",
        ["NIH:U19AG023122"],
    )
    grant = runner.grants()["NIH:U19AG023122"]
    assert (grant["agency"], grant["amount"]["usd"]) == ("NIA", 601000)
    document, _ = read_export(export_dir(runner.store))
    listing = next(g for w in document["works"] for g in w["grants"] if g["grant"] == "NIH:U19AG023122")
    assert (listing["how"], listing["cited_as"]) == ("override", ["U19AG02312"])
    assert listing["override"]["by"] == "mriffle"


def test_an_override_naming_a_grant_reporter_lacks_alerts(tmp_path: Path) -> None:
    runner = Runner(tmp_path)
    runner()
    runner.overrides = overrides_file(
        tmp_path, override(runner.work(C), "grant", "  raw: U19AG02312\n  grant: NIH:U19AG099999\n")
    )
    result = runner(WEEK_LATER)
    assert result.status == "alert"
    assert "names NIH:U19AG099999, which NIH RePORTER does not hold" in result.report


def test_each_family_is_valued_by_its_own_source(seeded: Runner) -> None:
    grants = seeded.grants()
    nih = grants["NIH:R01GM086688"]
    assert (nih["agency"], nih["category"], nih["amount"]["usd"]) == ("NIGMS", "research", 601000)
    assert nih["flags"] == ["active"]
    centre = grants["NIH:P30DK017047"]  # its sub-project row is never added (F6)
    assert (centre["category"], centre["amount"]["usd"], centre["facts"]["reporter"]["fiscal_years"]) == (
        "center", 601000, {"2020": 300000, "2021": 301000}
    )  # fmt: skip
    nsf = grants["NSF:1443474"]
    assert (nsf["amount"]["basis"], nsf["amount"]["usd"], nsf["facts"]["nsf"]["type"]) == (
        "nsf_obligated", 400430, "Standard Grant"
    )  # fmt: skip
    assert nsf["pis"] == [{"name": "SAMPLE Investigator G", "id": None}]
    wellcome = grants["WT:092809Z10Z"]
    assert (wellcome["amount"]["currency"], wellcome["amount"]["usd"], wellcome["number"]) == (
        "GBP", 1545200, "WT 092809/Z/10/Z"
    )  # fmt: skip
    assert wellcome["scope"] == "institution-wide" and wellcome["title"] == "SAMPLE: A consortium"
    nasa = grants["USA:NASA:NNX14AJ87G"]
    assert (nasa["amount"]["basis"], nasa["amount"]["original"], nasa["organization"]) == (
        "usaspending_obligation", "796089.19", "SAMPLE UNIVERSITY"
    )  # fmt: skip
    funder = grants["F4320399999:SFE20180099"]
    assert (funder["family"], funder["amount"]["currency"]) == ("openalex_funder", "CNY")
    agencies = {line["code"]: line for line in io.read_jsonl(seeded.store / "funding" / "agencies.jsonl")}
    assert agencies["F4320399999"]["country"] == "DE" and agencies["NIGMS"]["parent"] == "NIH"
    assert agencies["MISC"]["group"] == "miscellaneous"


def test_the_export_carries_the_stages_funding_and_rebuilds_the_same(seeded: Runner) -> None:
    document, lookup = read_export(export_dir(seeded.store))
    assert document["funding"]["version"] == "2099-01-01.1"
    assert document["funding"]["as_of"] == "2026-10-03"  # this run was a full refresh
    config = load_config(config_dir=funding_config(seeded.tmp_path))
    rebuilt = build_from_store(
        seeded.store,
        resource_block(config),
        channels=config.channels,
        rate_sources=config.exchange_rates["sources"],
    )
    assert rebuilt == (document, lookup)


def test_every_reporter_request_is_sorted_and_excludes_sub_projects(seeded: Runner) -> None:
    """Checked by the fake as each is sent; here, that the stage sent some of each kind."""
    first = Runner(seeded.tmp_path / "again")
    first()
    posts = first.asked("api.reporter.nih.gov")
    assert {url.rsplit("/", 2)[-2] for _, url, _, _ in posts} == {"publications", "projects"}
    assert all(method == "POST" for method, _, _, _ in posts)


def test_a_first_run_asks_each_source_this_often(seeded: Runner) -> None:
    """The request counts per source on this fixture, for the report and B8 to compare."""
    manifest = seeded.manifest(_latest(seeded))
    # RePORTER: the links, one batch of cores, three institute-and-serial probes (R01 GM12345,
    # P01 HL09296 and U19AG02312, none held). OpenAlex: one page of awards, one of funders. PMC's
    # XML was fetched by stage 4 for the text rules, so the stage reads it from the cache.
    assert manifest["funding"]["requests"] == {
        "crossref": 1, "nsf": 1, "openalex": 2, "pubmed": 1, "reporter": 5, "usaspending": 2,
    }  # fmt: skip


# --- reruns -----------------------------------------------------------------------------------------


def test_a_second_run_the_same_day_changes_no_funding_file(seeded: Runner) -> None:
    before = seeded.funding()
    result = seeded()
    assert result.status == "ok", result.errors
    assert seeded.funding() == before


def test_a_run_a_week_later_rewrites_no_funding_file(seeded: Runner) -> None:
    """Incremental: links every run, the active grant's facts, and nothing read twice (§9.2)."""
    before = seeded.funding()
    result = seeded(WEEK_LATER)
    assert result.status == "ok", result.errors
    assert seeded.funding() == before
    assert seeded.manifest(result)["funding"]["mode"] == "incremental"
    assert not [p for _, _, p, _ in seeded.asked("efetch.fcgi") if p.get("db") == "pubmed"]
    assert not [p for _, _, p, _ in seeded.asked("api.crossref.org") if p.get("select") == "DOI,funder"]
    assert not seeded.asked("api.nsf.gov")  # ended in 2020: not refreshed until a full refresh
    projects = [body for _, url, _, body in seeded.asked("projects/search")]
    assert [body["criteria"]["project_nums"] for body in projects] == [["R01GM086688"]]  # the active grant


def test_the_dates_move_once_they_are_28_days_old(seeded: Runner) -> None:
    seeded("2026-10-31T12:00:00+00:00")  # a Saturday, 28 days on: a full refresh
    string = seeded.strings(A)["R01 GM086688"]
    assert (string["first_seen"], string["last_seen"]) == ("2026-10-03", "2026-10-31")
    assert seeded.grants()["NSF:1443474"]["checked"] == "2026-10-31"


# --- degradation ------------------------------------------------------------------------------------


def test_a_reporter_outage_keeps_every_grant_and_degrades(seeded: Runner) -> None:
    before = seeded.funding()
    seeded.world.reporter_status = 503
    result = seeded(WEEK_LATER)
    assert result.status == "degraded"
    assert "source:reporter: funding: HttpError" in result.report
    assert seeded.funding() == before
    assert seeded.manifest(result)["funding"]["grants"] == len(seeded.grants())


def test_a_reporter_403_raises_the_ip_block_alert(seeded: Runner) -> None:
    seeded.world.reporter_status = 403
    result = seeded(WEEK_LATER)
    assert result.status == "alert"
    assert "possible IP block — RUNBOOK" in result.report
    assert len(seeded.asked("api.reporter.nih.gov")) == 1  # not asked again this run


def test_a_changed_shape_degrades_and_never_raises(seeded: Runner) -> None:
    """The active grant's facts come back without their fiscal years: its stored facts stand."""
    before = seeded.funding()
    seeded.world.reporter_shape = False
    result = seeded(WEEK_LATER)
    assert result.status == "degraded", result.errors
    assert "a reply of a changed shape (KeyError" in result.report
    assert seeded.funding() == before


def test_a_new_work_in_a_degraded_run_has_no_line_yet(run: Runner) -> None:
    run.world.reporter_status = 503
    result = run()
    assert result.status == "degraded"
    assert result.written
    assert run.lines() == {}
    assert validate_store(run.store).errors == []


def test_an_unexpected_funding_error_carries_forward_and_alerts(
    seeded: Runner, monkeypatch: pytest.MonkeyPatch
) -> None:
    before = seeded.funding()

    def broken(*_: object, **__: object) -> None:
        raise RuntimeError("a bug in the funding stage")

    monkeypatch.setattr(stage_module.FundingStage, "_line", broken)
    result = seeded(WEEK_LATER)
    assert result.status == "alert" and result.written
    assert "stage:funding: failed with RuntimeError: a bug in the funding stage" in result.report
    assert "the stored funding was carried forward" in result.report
    assert seeded.funding() == before
    assert seeded.manifest(result)["funding"]["mode"] == "skipped"


@pytest.mark.parametrize("where", ["store", "export"])
def test_output_its_own_check_refuses_is_carried_forward(
    seeded: Runner, monkeypatch: pytest.MonkeyPatch, where: str
) -> None:
    """§9.4: what the gate (invariant F6) or stage 11 (`json_number`) would refuse never reaches them."""
    before = seeded.funding()
    if where == "store":
        real = value_grant

        def off_by_one(*args: Any, **kwargs: Any) -> Any:
            valued = real(*args, **kwargs)
            if valued.amount is not None and valued.amount["usd"] is not None:
                valued.amount["usd"] += 1
            return valued

        monkeypatch.setattr(stage_module, "value_grant", off_by_one)
    else:  # an amount no JSON number can carry, which the export refuses rather than rounds
        awards = seeded.world.openalex_awards
        awards["G6"] = {**awards["G6"], "amount": "0.1000000000000000055511151231257827"}
    result = seeded(WEEK_LATER, funding="full")
    assert result.status == "alert" and result.written, result.errors
    assert "stage:funding" in result.report
    assert seeded.funding() == before


# --- merges and removals ------------------------------------------------------------------------------


def test_a_merge_moves_the_funding_line_to_the_surviving_work(seeded: Runner) -> None:
    kept, gone = sorted([seeded.work(A), seeded.work(B)])
    seeded.overrides = overrides_file(seeded.tmp_path, override(f"[{kept}, {gone}]", "merge"))
    result = seeded(WEEK_LATER, funding="skip")  # carried: the line moves even when nothing is decided
    assert result.status == "ok", result.errors
    lines = seeded.lines()
    assert gone not in lines
    assert {"R01 GM086688", "P01 HL09296"} <= {s["raw"] for s in lines[kept]["strings"]}
    assert validate_store(seeded.store, seeded.overrides).errors == []
    decided = seeded(WEEK_LATER)  # and when the stage decides, too
    assert decided.status == "ok", decided.errors
    assert {"NIH:R01GM086688", "NIH:P01HL092969"} <= set(seeded.lines()[kept]["grants"])


def test_an_excluded_work_takes_its_citations_with_it(seeded: Runner) -> None:
    work = seeded.work(D)
    assert "NIH:R21AI123456" in seeded.grants()
    seeded.overrides = overrides_file(seeded.tmp_path, override(work, "exclude"))
    result = seeded(WEEK_LATER)
    assert result.status == "ok", result.errors
    assert work not in seeded.lines()
    assert "NIH:R21AI123456" not in seeded.grants()  # only the excluded work listed it
    agencies = {line["code"] for line in io.read_jsonl(seeded.store / "funding" / "agencies.jsonl")}
    assert "NIAID" not in agencies
    assert validate_store(seeded.store, seeded.overrides).errors == []


# --- what is kept -------------------------------------------------------------------------------------


def test_a_string_keeps_its_decision_until_every_source_that_showed_it_is_read(seeded: Runner) -> None:
    """OpenAlex stops naming NSF for 1443474; Crossref still does, but is read only at a full refresh.

    Decided from OpenAlex alone, the week after, it would fall to Miscellaneous and come back
    at the next full refresh. It keeps its decision instead, and at the full refresh, with Crossref
    read again, it is decided from both.
    """
    seeded.world.nsf_funder = None
    seeded(WEEK_LATER)
    assert seeded.strings(A)["1443474"]["grants"] == ["NSF:1443474"]
    seeded("2026-10-31T12:00:00+00:00")
    string = seeded.strings(A)["1443474"]
    assert (string["grants"], string["sources"]) == (["NSF:1443474"], ["crossref", "openalex"])


def test_a_sighting_a_source_stops_showing_is_kept(seeded: Runner) -> None:
    """§9.4: OpenAlex and Crossref both stop showing 1443474; it stays, and its `last_seen` stops."""
    dropped = Paper(A.number, A.pmid, A.doi, True, A.awards[:-1], A.pmcid)
    seeded.world.papers = (dropped, B, C, D)
    seeded.world.crossref_funders = {}
    result = seeded("2026-10-31T12:00:00+00:00")
    assert result.status == "ok", result.errors
    string = seeded.strings(A)["1443474"]
    assert (string["grants"], string["last_seen"]) == (["NSF:1443474"], "2026-10-03")


# --- modes and the window -----------------------------------------------------------------------------


def test_the_window_is_new_york_time() -> None:
    window = {"tz": "America/New_York", "weekend": True, "weekday_hours": [21, 5]}
    assert in_window(dt.datetime.fromisoformat(SATURDAY), window)
    assert not in_window(dt.datetime.fromisoformat(MONDAY_MORNING), window)
    assert in_window(dt.datetime.fromisoformat(MONDAY_NIGHT), window)
    assert in_window(dt.datetime(2026, 11, 3, 9, 59), window)  # naive is UTC: 04:59 in New York
    assert not in_window(dt.datetime(2026, 11, 3, 10, 0, tzinfo=dt.UTC), window)


def test_a_full_refresh_waits_for_the_reporter_window(seeded: Runner) -> None:
    deferred = seeded(MONDAY_MORNING)
    assert deferred.status == "ok", deferred.errors
    assert seeded.manifest(deferred)["funding"]["mode"] == "deferred"
    assert "a full refresh is due and was deferred" in deferred.report
    assert not [p for _, _, p, _ in seeded.asked("efetch.fcgi") if p.get("db") == "pubmed"]

    inside = seeded(MONDAY_NIGHT)
    assert seeded.manifest(inside)["funding"]["mode"] == "full"
    assert [p for _, _, p, _ in seeded.asked("efetch.fcgi") if p.get("db") == "pubmed"]


def test_a_version_change_makes_a_full_refresh_due(seeded: Runner) -> None:
    seeded.config = funding_config(seeded.tmp_path, funding_version="2099-01-01.2")
    result = seeded(WEEK_LATER)
    assert seeded.manifest(result)["funding"]["mode"] == "full"
    assert {line["funding_version"] for line in seeded.lines().values()} == {"2099-01-01.2"}


def test_funding_full_runs_a_full_refresh_outside_the_window(seeded: Runner) -> None:
    result = seeded(MONDAY_MORNING, funding="full")
    assert seeded.manifest(result)["funding"]["mode"] == "full"


def test_outside_the_window_reporter_requests_stop_at_the_cap(run: Runner) -> None:
    run.config = funding_config(run.tmp_path, reporter={
        "window": {"tz": "America/New_York", "weekend": True, "weekday_hours": [21, 5]},
        "weekday_request_cap": 1,
    })  # fmt: skip
    result = run(MONDAY_MORNING)
    assert result.status == "ok", result.errors
    assert len(run.asked("api.reporter.nih.gov")) == 1  # the links, then nothing
    assert "RePORTER question(s) deferred" in result.report
    assert run.lines() == {}  # every new work needs RePORTER's answers; none is decided on half


def test_funding_skip_carries_the_stored_funding_forward(seeded: Runner) -> None:
    before = seeded.funding()
    result = seeded(WEEK_LATER, funding="skip")
    assert seeded.manifest(result)["funding"]["mode"] == "skipped"
    assert seeded.funding() == before
    assert not seeded.asked("api.reporter.nih.gov")


def test_a_partial_run_leaves_funding_alone(seeded: Runner) -> None:
    before = seeded.funding()
    result = seeded(WEEK_LATER, channels=("B1",))
    assert result.written
    assert seeded.manifest(result)["funding"]["mode"] == "skipped"
    assert seeded.funding() == before
    assert not seeded.asked("api.reporter.nih.gov")


def test_funding_disabled_asks_nothing_and_writes_nothing(run: Runner) -> None:
    """`enabled: false` is how the stage lands: the run is the run it was before (§9.1)."""
    run.config = PROJECT / "config"
    result = run()
    assert result.status == "ok", result.errors
    assert not (run.store / "funding").exists()
    assert set(run.manifest(result)["funding"]) == {"version", "fingerprint"}
    for host in ("api.reporter.nih.gov", "api.nsf.gov", "api.usaspending.gov", "openalex.org/awards"):
        assert not run.asked(host), host
    assert not [p for _, _, p, _ in run.asked("efetch.fcgi") if p.get("db") == "pubmed"]


# --- small pieces ---------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("project_num", "key"),
    [
        ("272201700059C-0-0-1", "NIH-contract:HHSN272201700059C"),
        ("272201700036I-0-759302000001-1", "NIH-contract:HHSN272201700036I:75N93020F00001"),
        ("272201700036I-P00004-759302000001-1", "NIH-contract:HHSN272201700036I:75N93020F00001"),
        ("75N93019D00003-0-759301900131-1", "NIH-contract:75N93019D00003:75N93019F00131"),
        ("5R01GM086688-05", None),
    ],
)
def test_a_contract_is_keyed_from_its_project_number(project_num: str, key: str | None) -> None:
    assert contract_key(project_num) == key


def test_contracts_and_task_orders_are_keyed_by_their_own_numbers(run: Runner) -> None:
    """§6.7: an IDIQ and a task order on one work list the task order alone, valued by its own rows;
    a link to a contract names RePORTER's truncated core, and is keyed by the contract's number."""
    run.world.contracts = True
    extra = (award("HHSN272201700036I", NIH_FUNDER), award("75N93020F00001", NIH_FUNDER))
    run.world.papers = (A, B, Paper(C.number, C.pmid, C.doi, True, C.awards + extra), D)
    run.world.links[B.pmid] = [*run.world.links[B.pmid], ("27220170005", 5_500_001)]
    result = run()
    assert result.status == "ok", (result.errors, result.report)
    order = "NIH-contract:HHSN272201700036I:75N93020F00001"
    assert run.strings(C)["HHSN272201700036I"]["grants"] == [order]
    assert run.strings(C)["75N93020F00001"]["grants"] == [order]
    grants = run.grants()
    amount = grants[order]["amount"]
    assert (amount["basis"], amount["usd"]) == ("reporter_task_order", 1_471_125)
    assert (grants[order]["number"], grants[order]["category"], grants[order]["agency"]) == (
        "75N93020F00001",
        "contract",
        "NIAID",
    )
    link = next(link for link in run.lines()[run.work(B)]["nih_links"] if link["core"] == "27220170005")
    assert link["grant"] == "NIH-contract:HHSN272201700059C"
    contract = grants["NIH-contract:HHSN272201700059C"]
    assert (contract["amount"]["basis"], contract["amount"]["usd"]) == ("reporter_contract", 9_000_000)
    assert validate_store(run.store).errors == []
    document, _ = read_export(export_dir(run.store))
    listing = next(g for w in document["works"] for g in w["grants"] if g["grant"] == contract["key"])
    assert listing["how"] == "nih_link"


def test_a_sighting_source_down_degrades_and_decides_from_the_rest(run: Runner) -> None:
    """PubMed and Crossref degrade on their own; the works are decided from what answered."""
    run.world.down = frozenset({"pubmed", "crossref"})
    result = run()
    assert result.status == "degraded", result.errors
    assert "source:pubmed: funding" in result.report
    assert "source:crossref: funding" in result.report
    assert run.strings(A)["R01 GM086688"]["sources"] == ["jats", "openalex"]
    assert run.strings(A)["1443474"]["grants"] == ["NSF:1443474"]
    assert validate_store(run.store).errors == []


def test_jats_names_a_funder_by_name_only_without_a_registry_id() -> None:
    found = [
        JatsString("OCE-1633939", "award", "award-group", ("National Science Foundation",), ()),
        JatsString("R01 GM086688", "award", "award-group", ("NIGMS", "NIH"), ("10.13039/100000057", "x")),
        JatsString("W911NF-22-2-0059", "award", "award-group"),
        JatsString("P30 DK017047", "nih", "ack"),
    ]
    assert [(s.raw, s.funder, s.funder_id) for s in jats_sightings(found)] == [
        ("OCE-1633939", "National Science Foundation", None),
        ("R01 GM086688", "NIGMS", "10.13039/100000057"),
        ("R01 GM086688", "NIH", "10.13039/100000057"),
        ("W911NF-22-2-0059", None, None),
        ("P30 DK017047", None, None),
    ]


def test_openalex_awards_of_a_changed_shape_raise_for_the_stage_to_degrade() -> None:
    with pytest.raises(TypeError):
        openalex_sightings({"awards": {"funder_award_id": "R01"}})  # no longer a list


@pytest.mark.parametrize(
    "raw",
    [
        ["not a mapping"],
        {"id": "https://openalex.org/W123", "amount": 1},  # not an award's id
        {"id": "https://openalex.org/G1", "amount": True},  # not an amount
        {"id": "https://openalex.org/G1", "amount": "one million"},
    ],
)
def test_an_openalex_award_of_a_changed_shape_raises(raw: object) -> None:
    with pytest.raises((TypeError, ValueError, ArithmeticError)):
        stage_module._openalex_award(raw)


def test_an_openalex_award_keeps_what_the_amount_rules_read() -> None:
    award = stage_module._openalex_award(
        {
            "id": "https://openalex.org/G42",
            "amount": 1500.50,
            "currency": "gbp",
            "provenance": "gtr",
            "start_year": 2019,
            "end_year": 2022,
            "lead_investigator": {"given_name": "Ada", "family_name": "Lovelace"},
            # A list, as OpenAlex gives it (B6's live reads, 2026-09-26).
            "institution_awarded": [{"id": "https://openalex.org/I1", "display_name": "SAMPLE UNIVERSITY"}],
        }
    )
    expected = {"id": "G42", "amount": "1500.5", "currency": "GBP", "provenance": "gtr", "start_year": 2019}
    assert award.fact == expected
    assert award.pis == ({"name": "Ada Lovelace", "id": None},)
    assert (award.organization, award.start, award.end) == ("SAMPLE UNIVERSITY", "2019", "2022")


def test_a_row_or_award_of_a_changed_shape_raises() -> None:
    with pytest.raises(TypeError):
        stage_module._reporter_row(["a list"])
    with pytest.raises(ValueError, match="sometime"):
        stage_module._reporter_row({"appl_id": 1, "fiscal_year": 2020, "project_start_date": "sometime"})
    with pytest.raises(ValueError, match="generated_unique_award_id"):
        stage_module._usaspending_info({"total_obligation": 1})
