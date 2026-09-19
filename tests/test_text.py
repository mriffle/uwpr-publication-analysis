"""Structural JATS extraction (Phase 1 §6.1).

The documents here are synthetic, as P10 requires: no real full text reaches this repository.
They carry the things real PMC XML carries and hand-written snippets usually don't — a DOCTYPE,
namespaces, inline markup, `<label>` numbering and nested blocks — because a parser that only
ever saw tidy XML would still fall over on the real thing.
"""

import pytest

from uwpr_pubs.config import load_config
from uwpr_pubs.text import TextRules, parse_jats, split_sentences, text_rules

ARTICLE = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE article PUBLIC "-//NLM//DTD JATS (Z39.96) Journal Archiving DTD v1.2 20190208//EN"
 "JATS-archivearticle1.dtd">
<article xmlns:xlink="http://www.w3.org/1999/xlink" article-type="research-article">
  <front>
    <article-meta>
      <title-group><article-title>A study of <italic>things</italic></article-title></title-group>
      <contrib-group>
        <contrib contrib-type="author">
          <name><surname>Smith</surname><given-names>Jane Q.</given-names></name>
          <xref ref-type="aff" rid="a1">1</xref>
        </contrib>
        <contrib contrib-type="author">
          <name><surname>Eng</surname><given-names>Jimmy K.</given-names></name>
        </contrib>
        <aff id="a1"><label>1</label>University of Washington Proteomics Resource,
          850 Republican Street, Seattle, WA 98109, USA</aff>
      </contrib-group>
      <abstract><p>An abstract that must never become a sentence.</p></abstract>
    </article-meta>
  </front>
  <body>
    <sec><title>Introduction</title>
      <p>We studied the thing. It was interesting.</p>
    </sec>
    <sec><title>Materials and Methods</title>
      <sec><title>Sample preparation</title>
        <p>Samples were stored at -80C. Mass spectrometry was carried out at the University of
        Washington Proteomics Resource (Seattle, WA).</p>
      </sec>
    </sec>
    <sec><title>Results</title>
      <p>A list follows:
        <list list-type="bullet">
          <list-item><p>The first item.</p></list-item>
          <list-item><p>The second item.</p></list-item>
        </list>
      </p>
      <table-wrap><label>Table 1</label><table><tr><td>Do not read me</td></tr></table></table-wrap>
    </sec>
  </body>
  <back>
    <ack><title>Acknowledgements</title>
      <p>We thank P. D. von Haller for technical assistance. We also thank Dr. Prof for nothing.</p>
    </ack>
    <fn-group><fn><p>A footnote about funding.</p></fn></fn-group>
    <ref-list><ref><mixed-citation>Someone et al. A cited paper. J 2010.</mixed-citation></ref></ref-list>
  </back>
</article>
"""

NO_BODY = """<article>
  <front><article-meta>
    <contrib-group><aff>Fred Hutchinson Cancer Center Proteomics Resource, Seattle</aff></contrib-group>
  </article-meta></front>
  <back><ack><p>Supported by the University of Washington Proteomics Resource (UWPR95794).</p></ack></back>
</article>
"""


@pytest.fixture(scope="module")
def rules() -> TextRules:
    return text_rules(load_config().rules["text"])


def test_a_real_shaped_document_parses(rules: TextRules) -> None:
    document = parse_jats(ARTICLE, rules)
    assert document is not None
    assert document.body_available


def test_unparsable_xml_is_not_an_exception(rules: TextRules) -> None:
    assert parse_jats("<article><unclosed>", rules) is None


def test_removed_parts_never_become_sentences(rules: TextRules) -> None:
    document = parse_jats(ARTICLE, rules)
    assert document is not None
    whole = document.text
    assert "abstract that must never" not in whole  # not a kept element (§6.1 item 4)
    assert "Do not read me" not in whole  # table-wrap
    assert "A cited paper" not in whole  # ref-list
    assert "Smith" not in whole  # contrib-group


def test_the_author_list_is_kept_for_r7_even_though_it_is_not_text(rules: TextRules) -> None:
    document = parse_jats(ARTICLE, rules)
    assert document is not None
    assert document.author_names == ("Jane Q. Smith", "Jimmy K. Eng")


def test_affiliations_survive_contrib_group_removal(rules: TextRules) -> None:
    """R5 reads `<aff>`, which usually sits inside the `<contrib-group>` §6.1 removes."""
    document = parse_jats(ARTICLE, rules)
    assert document is not None
    assert document.affiliations == (
        "University of Washington Proteomics Resource, 850 Republican Street, Seattle, WA 98109, USA",
    )


def test_label_numbering_is_dropped_from_affiliations(rules: TextRules) -> None:
    document = parse_jats(ARTICLE, rules)
    assert document is not None
    assert not document.affiliations[0].startswith("1")


def test_a_heading_is_never_glued_onto_the_sentence_after_it(rules: TextRules) -> None:
    """The bug that made excerpts unusable: block boundaries end sentences (changed 2026-09-19)."""
    document = parse_jats(ARTICLE, rules)
    assert document is not None
    texts = [sentence.text for sentence in document.sentences]
    assert "Samples were stored at -80C." in texts
    assert not any("Sample preparation Samples were stored" in text for text in texts)


def test_sections_come_from_the_tree(rules: TextRules) -> None:
    document = parse_jats(ARTICLE, rules)
    assert document is not None
    sections = {sentence.text: sentence.section for sentence in document.sentences}
    assert sections["Samples were stored at -80C."] == "methods"
    assert sections["We studied the thing."] == "main text"
    assert sections["A footnote about funding."] == "author notes"
    assert document.affiliations and document.blocks[0].section == "affiliation"
    thanks = next(t for t in sections if t.startswith("We thank P. D."))
    assert sections[thanks] == "acknowledgements"


def test_a_nested_section_inherits_methods_from_its_ancestor(rules: TextRules) -> None:
    """ "Sample preparation" names no method; "Materials and Methods" above it does."""
    document = parse_jats(ARTICLE, rules)
    assert document is not None
    titles = {s.text: s.section for s in document.sentences if s.text == "Sample preparation"}
    assert titles == {"Sample preparation": "methods"}


def test_nested_blocks_are_split_on_their_own(rules: TextRules) -> None:
    document = parse_jats(ARTICLE, rules)
    assert document is not None
    texts = [sentence.text for sentence in document.sentences]
    assert "The first item." in texts
    assert "A list follows:" in texts
    assert not any("A list follows: The first item" in text for text in texts)


def test_a_document_with_no_body_still_yields_evidence(rules: TextRules) -> None:
    """Some PMC records are publisher-restricted; their front and back matter still count."""
    document = parse_jats(NO_BODY, rules)
    assert document is not None
    assert not document.body_available
    assert "UWPR95794" in document.text
    assert document.affiliations == ("Fred Hutchinson Cancer Center Proteomics Resource, Seattle",)


def test_namespaced_jats_is_read_the_same_way(rules: TextRules) -> None:
    namespaced = '<article xmlns="http://jats.nlm.nih.gov"><body><p>One. Two.</p></body></article>'
    document = parse_jats(namespaced, rules)
    assert document is not None
    assert [s.text for s in document.sentences] == ["One.", "Two."]


def test_bytes_and_str_agree(rules: TextRules) -> None:
    assert parse_jats(ARTICLE.encode("utf-8"), rules) == parse_jats(ARTICLE, rules)


# --- sentence splitting (§6.1 item 6) -------------------------------------------------------


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("One thing. Another thing.", ["One thing.", "Another thing."]),
        ("First; second.", ["First;", "second."]),
        # The bug that hid 11 staff acknowledgements, one of them a new paper (PMID 21875946).
        (
            "We thank P. D. von Haller for help.",
            ["We thank P. D. von Haller for help."],
        ),
        (
            "Thanks to A. Smith, W. Conrad, P. von Haller and others.",
            ["Thanks to A. Smith, W. Conrad, P. von Haller and others."],
        ),
        ("Initials P.D. von Haller here.", ["Initials P.D. von Haller here."]),
        ("See Fig. 2 for detail.", ["See Fig. 2 for detail."]),
        ("Shown in Ref. 4 and e.g. elsewhere.", ["Shown in Ref. 4 and e.g. elsewhere."]),
        ("Thanks to Dr. von Haler for help.", ["Thanks to Dr. von Haler for help."]),
        ("Grown at 37 C. The cells died.", ["Grown at 37 C. The cells died."]),
        # A word merely ending in an abbreviation still ends a sentence.
        ("We used a config. It worked.", ["We used a config.", "It worked."]),
    ],
)
def test_sentence_splitting(text: str, expected: list[str], rules: TextRules) -> None:
    assert split_sentences(text, rules) == expected


def test_splitting_needs_whitespace_after_the_stop(rules: TextRules) -> None:
    """`10.1021/ac100372c` and `v1.2` are not sentence ends."""
    assert split_sentences("The DOI is 10.1021/ac100372c and that is all.", rules) == [
        "The DOI is 10.1021/ac100372c and that is all."
    ]
