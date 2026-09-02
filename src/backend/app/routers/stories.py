"""
Stories proxy router.

GET /api/stories/count?tags=<iri>&tags=<iri>&lang=de

1. Maps each IRI to a WordPress term ID via compass:wpTagId in the RDF graph.
2. Builds a frontend stories URL for user navigation (?tag=id1,id2,id3).
3. Queries the WordPress REST API for the story count via the X-WP-Total header.
4. Returns {"count": N, "url": "...", "status": "...", "message": "..."}.

Response status values:
- "ok":              Count retrieved successfully.
- "no_tags":         No tag IRIs were provided in the request.
- "no_ID_mapping":   None of the provided IRIs have a compass:wpTagId mapping.
- "upstream_error":  The OceanCare WordPress API returned an error or was unreachable.

DISCLAIMER: The WordPress REST API uses OR logic for comma-separated tags.
            Stories tagged with ANY of the provided tags are counted.
            True AND filtering is not supported by the standard endpoint.

Concepts without a compass:wpTagId triple are silently skipped.
If no IRIs map to WP IDs, returns count=0 and the base stories URL.
"""
import logging
from typing import List

import httpx
from fastapi import APIRouter, Depends, Query

from app.config import stories_base_url
from app.rdf import RDFStore, get_store

logger = logging.getLogger(__name__)

COMPASS_NS = "http://example.org/ocean-org/ontology#"
OCEANCARE_API_STORIES = "https://www.oceancare.org/wp-json/wp/v2/stories"

router = APIRouter()


def _resolve_tags_ids(iris: List[str], store: RDFStore) -> List[int]:
    """Return the WordPress term IDs for the given IRIs (skips unmapped ones)."""
    if not iris:
        return []
    values_clause = " ".join(f"<{iri}>" for iri in iris)
    sparql = f"""
    PREFIX compass: <{COMPASS_NS}>
    SELECT DISTINCT ?wpTagId WHERE {{
        VALUES ?concept {{ {values_clause} }}
        ?concept compass:wpTagId ?wpTagId .
    }}
    """
    rows = store.query(sparql)
    return [int(row["wpTagId"]) for row in rows if row.get("wpTagId")]


def _build_frontend_url(wp_ids: List[int], lang: str) -> str:
    """Construct the language-specific filtered stories URL from WP term IDs."""
    base = stories_base_url(lang)
    if not wp_ids:
        return base
    tags_param = ",".join(str(i) for i in wp_ids)
    return f"{base}?tag={tags_param}"


def _build_api_url(wp_ids: List[int]) -> str:
    """Construct the WordPress REST API URL for counting stories."""
    tags_param = ",".join(str(i) for i in wp_ids)
    return f"{OCEANCARE_API_STORIES}?tags={tags_param}&per_page=1&_fields=id"


@router.get("/stories/count")
async def get_stories_count(
    tags: List[str] = Query(default=[]),
    lang: str = Query("en", pattern="^(en|de)$"),
    store: RDFStore = Depends(get_store),
):
    """Return the number of OceanCare stories matching the given tag IRIs."""
    if not tags:
        logger.info("Stories count requested with no tags")
        return {
            "count": 0,
            "url": stories_base_url(lang),
            "status": "no_tags",
            "message": None,
        }

    wp_ids = _resolve_tags_ids(tags, store)
    if not wp_ids:
        logger.warning("No ID (wpTagId) mapping for IRIs: %s", tags)
        return {
            "count": 0,
            "url": stories_base_url(lang),
            "status": "no_ID_mapping",
            "message": None,
        }

    frontend_url = _build_frontend_url(wp_ids, lang)
    api_url = _build_api_url(wp_ids)

    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            resp = await client.get(api_url)
            resp.raise_for_status() 
        count = int(resp.headers.get("x-wp-total", 0))
    except httpx.HTTPStatusError as exc:
        logger.error("OceanCare API returned %s for %s", exc.response.status_code, api_url)
        return {
            "count": 0,
            "url": frontend_url,
            "status": "upstream_error",
            "message": "Unable to load story count. Please try again or contact OceanCare.",
        }
    except Exception as exc:
        logger.error("OceanCare API unreachable: %s", exc, exc_info=True)
        return {
            "count": 0,
            "url": frontend_url,
            "status": "upstream_error",
            "message": "Unable to load story count. Please try again or contact OceanCare.",
        }

    return {
        "count": count,
        "url": frontend_url,
        "status": "ok",
        "message": None,
    }
