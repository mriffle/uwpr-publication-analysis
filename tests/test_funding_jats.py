"""Grant numbers read from JATS (docs/09): award groups whole, prose only for full numbers."""

import pytest

from uwpr_pubs.funding.jats import CONTEXT, FundingString, funding_strings


def article(front: str = "", back: str = "", body: str = "") -> str:
    return (
        '<?xml version="1.0"?><article xmlns:xlink="http://www.w3.org/1999/xlink">'
        f"<front><article-meta>{front}</article-meta></front><body>{body}</body><back>{back}</back></article>"
    )


FUNDING_GROUP = """
<funding-group>
  <award-group id="GS1">
    <funding-source>
      <institution-wrap>
        <institution-id institution-id-type="FundRef">http://dx.doi.org/10.13039/100000057</institution-id>
        <institution>National Institute of General Medical Sciences</institution>
      </institution-wrap>
    </funding-source>
    <award-id>R01 GM086688</award-id>
    <award-id>P41GM103533</award-id>
  </award-group>
  <award-group>
    <funding-source>National Science Foundation
      <institution-id institution-id-type="doi">10.13039/100000001</institution-id></funding-source>
    <award-id>DBI-1933311</award-id>
  </award-group>
  <award-group><funding-source>Pew Charitable Trusts</funding-source></award-group>
  <funding-statement>This work was supported by NIH grants R01 GM086688 and P30 DK017047.</funding-statement>
</funding-group>
"""


def test_award_groups_give_each_award_with_its_funders() -> None:
    found = funding_strings(article(front=FUNDING_GROUP))
    assert found is not None
    awards = [item for item in found if item.kind == "award"]
    nigms = ("National Institute of General Medical Sciences",)
    fundref = ("http://dx.doi.org/10.13039/100000057",)
    assert awards == [
        FundingString("R01 GM086688", "award", "award-group", nigms, fundref),
        FundingString("P41GM103533", "award", "award-group", nigms, fundref),
        # A name written straight into the element, without its registry ID's text.
        FundingString(
            "DBI-1933311", "award", "award-group", ("National Science Foundation",), ("10.13039/100000001",)
        ),
    ]  # a group with no award ID gives nothing


def test_an_empty_or_repeated_award_id_is_given_once() -> None:
    group = (
        "<funding-group><award-group><funding-source>NIH</funding-source>"
        "<award-id/><award-id>R01 GM086688</award-id><award-id> R01  GM086688 </award-id>"
        "</award-group></funding-group>"
    )
    found = funding_strings(article(front=group))
    assert found == [FundingString("R01 GM086688", "award", "award-group", ("NIH",))]


def test_a_funding_statement_gives_full_nih_numbers_with_context() -> None:
    found = funding_strings(article(front=FUNDING_GROUP))
    assert found is not None
    prose = [item for item in found if item.kind != "award"]
    assert [(item.raw, item.kind, item.where) for item in prose] == [
        ("R01 GM086688", "nih", "funding-statement"),
        ("P30 DK017047", "nih", "funding-statement"),
    ]
    assert prose[0].context == "This work was supported by NIH grants R01 GM086688 and P30 DK017047."
    assert prose[0].funders == ()


@pytest.mark.parametrize(
    "number",
    [
        "R01GM086688",
        "R01 GM086688",
        "R01-GM-086688",
        "R01\u2013GM086688",  # an en dash
        "5R01GM086688-05",
        "5 R01 GM086688-05A1",
        "3P30DK017047-45S2",
        "UL1 TR000423",
        "DP3DK108220",
        "KL2TR000421",
        "RO1 GM086688",  # the letter O for a zero, which the parser corrects
        "P41 RR11823",  # a serial written without its leading zero
        "N01-HV-28179",  # an old contract, in NIH's own form
    ],
)
def test_full_nih_numbers_in_prose(number: str) -> None:
    found = funding_strings(article(back=f"<ack><p>Supported by {number}; thanks.</p></ack>"))
    assert found is not None
    assert [(item.raw, item.kind, item.where) for item in found] == [(number, "nih", "ack")]


@pytest.mark.parametrize(
    "text",
    [
        "the NIH (GM086688)",  # no activity code
        "an NIH R01 award",  # no institute or serial
        "a K99/R00 award",
        "NIH-R01",
        "NSF DBI-1933311",  # another agency's number is not read from prose
        "the antibodies PGT121 and PGDM1400",
        "RRID:SCR_022606",
        "R01 GM086",  # too short a serial
        "XR01GM086688",  # part of a longer token
        "R01GM086688X",
        "R01 ZZ086688",  # not an institute
        "Horizon 2020 project 101080544",
    ],
)
def test_partial_numbers_and_other_prose_are_ignored(text: str) -> None:
    found = funding_strings(article(back=f"<ack><p>We thank {text} for support.</p></ack>"))
    assert found == []


@pytest.mark.parametrize(
    "number",
    ["HHSN272201700059C", "HHSN268201000033C", "HHSN 272201700036I", "75N93020F00001", "75N93019D00003"],
)
def test_contracts_and_task_orders_in_prose(number: str) -> None:
    statement = f"<funding-statement>Contract {number}.</funding-statement>"
    found = funding_strings(article(front=f"<funding-group>{statement}</funding-group>"))
    assert found is not None
    assert [(item.raw, item.kind) for item in found] == [(number, "contract")]


@pytest.mark.parametrize(
    ("back", "where"),
    [
        ('<fn-group><fn fn-type="financial-disclosure"><p>R01 GM086688</p></fn></fn-group>', "fn"),
        ("<fn-group><fn><p>This work was funded by R01 GM086688.</p></fn></fn-group>", "fn"),
        ('<notes notes-type="funding-information"><p>R01 GM086688</p></notes>', "notes"),
        ("<notes><title>Funding</title><p>R01 GM086688</p></notes>", "notes"),
        ('<sec sec-type="funding"><p>R01 GM086688</p></sec>', "sec"),
        ("<sec><title>Grant support</title><p>R01 GM086688</p></sec>", "sec"),
        ('<sec id="s9"><label>9</label><title>Funding</title><p>R01 GM086688</p></sec>', "sec"),
        ("<sec><title>Sources of support</title><p>R01 GM086688</p></sec>", "sec"),
    ],
)
def test_funding_footnotes_notes_and_sections_are_read(back: str, where: str) -> None:
    found = funding_strings(article(back=back))
    assert found is not None
    assert [(item.raw, item.where) for item in found] == [("R01 GM086688", where)]


@pytest.mark.parametrize(
    "back",
    [
        "<fn-group><fn><p>Present address: R01 GM086688 Street.</p></fn></fn-group>",
        "<notes><title>Author contributions</title><p>R01 GM086688</p></notes>",
        "<sec><title>Support vector machines</title><p>R01 GM086688</p></sec>",
        "<sec><p>R01 GM086688</p></sec>",  # untitled
        "<notes><p>R01 GM086688</p></notes>",
        "<ref-list><ref><mixed-citation>R01 GM086688</mixed-citation></ref></ref-list>",
    ],
)
def test_prose_that_is_not_about_funding_is_not_read(back: str) -> None:
    assert funding_strings(article(back=back)) == []


def test_body_text_is_not_read() -> None:
    body = "<sec><title>Methods</title><p>Mice from R01 GM086688 were used.</p></sec>"
    assert funding_strings(article(body=body)) == []


def test_a_funding_section_inside_the_acknowledgements_is_read_once() -> None:
    back = (
        "<ack><title>Acknowledgements</title><p>We thank the staff.</p>"
        '<sec sec-type="funding"><title>Funding</title><p>R01 GM086688 and R01 GM086688.</p></sec></ack>'
    )
    found = funding_strings(article(back=back))
    assert found is not None
    assert [(item.raw, item.where) for item in found] == [("R01 GM086688", "ack")]


def test_block_boundaries_separate_words_and_labels_are_dropped() -> None:
    back = (
        '<fn-group><fn fn-type="supported-by"><label>*</label><p>Funding</p>'
        "<p>R01 GM086688</p></fn></fn-group>"
    )
    found = funding_strings(article(back=back))
    assert found is not None
    assert found[0].context == "Funding R01 GM086688"


def test_context_is_about_150_characters_around_the_number() -> None:
    before = "word " * 60
    after = " more" * 60
    found = funding_strings(article(back=f"<ack><p>{before}R01 GM086688{after}</p></ack>"))
    assert found is not None
    context = found[0].context
    assert "R01 GM086688" in context
    assert context.startswith("…") and context.endswith("…")
    assert len(context) <= CONTEXT + 2
    middle = context.index("R01 GM086688")
    assert abs(middle - (len(context) - middle - len("R01 GM086688"))) <= 3


def test_context_near_the_start_takes_more_from_after() -> None:
    found = funding_strings(article(back=f"<ack><p>R01 GM086688{' more' * 60}</p></ack>"))
    assert found is not None
    assert found[0].context.startswith("R01 GM086688 more")
    assert len(found[0].context) == CONTEXT + 1  # the trailing ellipsis


def test_the_same_number_in_two_places_is_one_sighting_each() -> None:
    front = "<funding-group><funding-statement>R01 GM086688</funding-statement></funding-group>"
    back = "<ack><p>R01 GM086688, again R01 GM086688.</p></ack>"
    found = funding_strings(article(front=front, back=back))
    assert found is not None
    assert [(item.raw, item.where) for item in found] == [
        ("R01 GM086688", "funding-statement"),
        ("R01 GM086688", "ack"),
    ]


def test_namespaced_jats_and_bytes_are_read() -> None:
    xml = (
        b'<j:article xmlns:j="http://jats.nlm.nih.gov"><j:back><j:ack><j:p>R01 GM086688</j:p></j:ack>'
        b"</j:back></j:article>"
    )
    found = funding_strings(xml)
    assert found is not None
    assert [(item.raw, item.where) for item in found] == [("R01 GM086688", "ack")]


def test_a_pmc_articleset_wrapper_is_read() -> None:
    xml = f"<pmc-articleset>{article(back='<ack><p>P30 DK017047</p></ack>')[21:]}</pmc-articleset>"
    found = funding_strings(xml)
    assert found is not None
    assert [item.raw for item in found] == ["P30 DK017047"]


@pytest.mark.parametrize(
    "xml",
    [
        "<article><unclosed></article>",
        '<!DOCTYPE a [<!ENTITY x "y">]><article>&x;</article>',  # entity declarations are refused
        "",
    ],
)
def test_xml_that_will_not_parse_is_none(xml: str) -> None:
    assert funding_strings(xml) is None


def test_comments_and_processing_instructions_are_skipped() -> None:
    xml = article(back="<ack><!-- R01 GM999999 --><?pi R01 GM999998?><p>R01 GM086688</p></ack>")
    found = funding_strings(xml)
    assert found is not None
    assert [item.raw for item in found] == ["R01 GM086688"]
