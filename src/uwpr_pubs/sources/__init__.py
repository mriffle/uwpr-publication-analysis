"""Source adapters: one per API, each turning a service's shape into ours."""


class ResultLimitError(RuntimeError):
    """A query matched more than its channel's `max_results` (docs/03 §10.3).

    Raised from the first page, using the total the API reports, rather than after paging through
    everything: one OpenAlex full-text search page costs $0.001, and a query that matches 13,608
    works would spend $0.068 discovering that it is too broad to be useful.
    """

    def __init__(self, total: int, limit: int) -> None:
        super().__init__(f"{total} results exceeds max_results {limit}")
        self.total = total
        self.limit = limit
