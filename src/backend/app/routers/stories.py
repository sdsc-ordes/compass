"""
Stories proxy router.

GET /api/stories/count?tags=<iri>&tags=<iri>&lang=de

1. Maps each IRI to a term ID via compass:wpTagId in the RDF graph.
2. Builds a frontend stories URL for user navigation (?tag=id1,id2,id3).
3. Queries the upstream stories API for the story count via the X-WP-Total header.
4. Returns {"count": N, "url": "...", "status": "...", "message": "..."}.

Response status values:
- "ok":              Count retrieved successfully.
- "no_tags":         No tag IRIs were provided in the request.
- "no_ID_mapping":   None of the provided IRIs have a compass:wpTagId mapping.
- "upstream_error":  The upstream stories API returned an error or was unreachable.

Filtering logic:
- A single tag uses the standard `?tags=<id>` endpoint.
- Multiple tags use `?tags[terms]=<id1>,<id2>&tags[operator]=AND`, so only
  stories tagged with ALL provided tags are counted.

Concepts without a compass:wpTagId triple are silently skipped.
If no IRIs map to IDs, returns count=0 and the base stories URL.
"""

import logging

import httpx
from fastapi import APIRouter, Depends, Query
from typing import List

from app.config import (
    STORIES_API_ERROR_MESSAGE,
    STORIES_PROVIDER_NAME,
    create_stories_api_url,
    create_stories_base_url,
    create_stories_frontend_url,
)
from app.namespaces import COMPASS
from app.rdf import RDFStore, get_store
from app.sparql_terms import iri_term, is_iri

logger = logging.getLogger(__name__)

router = APIRouter()


def _resolve_tags_ids(iris: list[str], store: RDFStore) -> list[int]:
    """Return the term IDs for the given IRIs (skips unmapped ones)."""
    # A tag IRI arrives from the query string, so one that cannot be written
    # as an IRIREF is dropped rather than interpolated into the query.
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


@router.get("/stories/count")
async def get_stories_count(
    tags: List[str] = Query(default=[]),
    lang: str = Query("en", pattern="^(en|de)$"),
    store: RDFStore = Depends(get_store),
):
    """Return the number of stories matching the given tag IRIs."""
    if not tags:
        logger.info("Stories count requested with no tags")
        return {
            "count": 0,
            "url": create_stories_base_url(lang),
            "status": "no_tags",
            "message": None,
        }

    ids = _resolve_tags_ids(tags, store)
    if not ids:
        logger.warning("No ID (wpTagId) mapping for IRIs: %s", tags)
        return {
            "count": 0,
            "url": create_stories_base_url(lang),
            "status": "no_ID_mapping",
            "message": None,
        }

    frontend_url = create_stories_frontend_url(ids, lang)
    api_url = create_stories_api_url(ids, lang)

    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            resp = await client.get(api_url)
            resp.raise_for_status() 
        count = int(resp.headers.get("x-wp-total", 0))
    except httpx.HTTPStatusError as exc:
        logger.error("%s API returned %s for %s", STORIES_PROVIDER_NAME, exc.response.status_code, api_url)
        return {
            "count": 0,
            "url": frontend_url,
            "status": "upstream_error",
            "message": STORIES_API_ERROR_MESSAGE,
        }
    except Exception as exc:
        logger.error("%s API unreachable: %s", STORIES_PROVIDER_NAME, exc, exc_info=True)
        return {
            "count": 0,
            "url": frontend_url,
            "status": "upstream_error",
            "message": STORIES_API_ERROR_MESSAGE,
        }

    return {
        "count": count,
        "url": frontend_url,
        "status": "ok",
        "message": None,
    }
