"""One adapter per source (docs/03-retrieval-pipeline.md §3.1).

Each adapter builds requests and parses responses. They hold no policy: which queries to run is
`channels.yaml`, and what counts as evidence is `rules.yaml`.
"""
