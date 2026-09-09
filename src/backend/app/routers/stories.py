"""Stories proxy router.

Maps concept IRIs to upstream term IDs via ``compass:wpTagId``, then queries
the configured stories provider for a count. HTTP route descriptions live in
OpenAPI (``summary`` / ``description`` on the route decorators).
"""

from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter, Query

from app.core.deps import ConfigDep, Lang, StoreDep
from app.namespaces import COMPASS
from app.rdf import RDFStore
from app.schemas.stories import StoriesCountResponse
from app.sparql_terms import iri_term, is_iri

logger = logging.getLogger(__name__)

router = APIRouter()


def _resolve_tags_ids(iris: list[str], store: RDFStore) -> list[int]:
    """Return upstream term IDs for the given concept IRIs.

    Concepts without a ``compass:wpTagId`` mapping are skipped. Invalid IRIs
    are ignored.

    Args:
        iris: Concept IRIs from the ``tags`` query parameter.
        store: Live RDF store.

    Returns:
        Distinct term IDs found in the graph.
    """
    terms = [iri_term(iri) for iri in iris if is_iri(iri)]
    if not terms:
        return []
    values_clause = " ".join(terms)
    sparql = f"""
    PREFIX compass: <{COMPASS}>
    SELECT DISTINCT ?wpTagId WHERE {{
        VALUES ?concept {{ {values_clause} }}
        ?concept compass:wpTagId ?wpTagId .
    }}
    """
    rows = store.query(sparql)
    return [int(row["wpTagId"]) for row in rows if row.get("wpTagId")]


@router.get(
    "/count",
    response_model=StoriesCountResponse,
    summary="Count stories for tag IRIs",
    description=(
        "Maps each IRI to a term ID via compass:wpTagId, builds a frontend "
        "stories URL, queries the upstream stories API, and returns "
        '{"count", "url", "status", "message"}. Status values: ok, no_tags, '
        "no_ID_mapping, upstream_error."
    ),
)
async def get_stories_count(
    cfg: ConfigDep,
    lang: Lang,
    store: StoreDep,
    tags: list[str] = Query(default=[]),
) -> StoriesCountResponse:
    if not tags:
        logger.info("Stories count requested with no tags")
        return StoriesCountResponse(
            count=0,
            url=cfg.create_stories_base_url(lang),
            status="no_tags",
            message=None,
        )

    ids = _resolve_tags_ids(tags, store)
    if not ids:
        logger.warning("No term-id mapping for IRIs: %s", tags)
        return StoriesCountResponse(
            count=0,
            url=cfg.create_stories_base_url(lang),
            status="no_ID_mapping",
            message=None,
        )

    frontend_url = cfg.create_stories_frontend_url(ids, lang)
    api_url = cfg.create_stories_api_url(ids, lang)

    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            resp = await client.get(api_url)
            resp.raise_for_status()
        count = cfg.parse_stories_count(resp)
    except httpx.HTTPStatusError as exc:
        logger.error(
            "%s API returned %s for %s",
            cfg.stories_provider_name,
            exc.response.status_code,
            api_url,
        )
        return StoriesCountResponse(
            count=0,
            url=frontend_url,
            status="upstream_error",
            message=cfg.stories_api_error_message,
        )
    except Exception as exc:
        logger.error(
            "%s API unreachable: %s",
            cfg.stories_provider_name,
            exc,
            exc_info=True,
        )
        return StoriesCountResponse(
            count=0,
            url=frontend_url,
            status="upstream_error",
            message=cfg.stories_api_error_message,
        )

    return StoriesCountResponse(
        count=count,
        url=frontend_url,
        status="ok",
        message=None,
    )
