"""
Stories proxy router.

GET /api/v1/stories/count?tags=<iri>&tags=<iri>&lang=de

1. Maps each IRI to a term ID via compass:wpTagId in the RDF graph.
2. Builds a frontend stories URL for user navigation.
3. Queries the configured upstream stories API for the story count.
4. Returns {"count": N, "url": "...", "status": "...", "message": "..."}.

Response status values:
- "ok":              Count retrieved successfully.
- "no_tags":         No tag IRIs were provided in the request.
- "no_ID_mapping":   None of the provided IRIs have a term-id mapping.
- "upstream_error":  The upstream stories API returned an error or was unreachable.

Concepts without a mapping triple are silently skipped.
If no IRIs map to IDs, returns count=0 and the base stories URL.
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
    """Return the term IDs for the given IRIs (skips unmapped ones)."""
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


@router.get("/count", response_model=StoriesCountResponse)
async def get_stories_count(
    cfg: ConfigDep,
    lang: Lang,
    store: StoreDep,
    tags: list[str] = Query(default=[]),
) -> StoriesCountResponse:
    """Return the number of stories matching the given tag IRIs."""
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
