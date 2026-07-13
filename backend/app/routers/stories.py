"""
Stories proxy router.

GET /api/stories/count?tag=<iri>&tag=<iri>&lang=de

1. Maps each IRI to a WordPress term ID via compass:wpTagId in the RDF graph.
2. Constructs a filtered stories URL: ?tag=id1,id2,id3
3. Fetches that page server-side (bypasses CORS) and counts story cards in the HTML.
4. Returns {"count": N, "url": "<filtered stories URL>"}.

Concepts without a compass:wpTagId triple are silently skipped.
If no IRIs map to WP IDs, returns count=0 and the base stories URL.
"""
import logging
from typing import List

import httpx
from fastapi import APIRouter, Depends, Query

from ..config import stories_base_url
from ..rdf import RDFStore, get_store

logger = logging.getLogger(__name__)

COMPASS_NS = "http://example.org/ocean-org/ontology#"

router = APIRouter()


def _resolve_wp_tag_ids(iris: List[str], store: RDFStore) -> List[int]:
    """Return the WordPress term IDs for the given IRIs (skips unmapped ones)."""
    if not iris:
        return []
    values_clause = " ".join(f"<{iri}>" for iri in iris)
    sparql = f"""
    PREFIX compass: <{COMPASS_NS}>
    SELECT ?wpTagId WHERE {{
        VALUES ?concept {{ {values_clause} }}
        ?concept compass:wpTagId ?wpTagId .
    }}
    """
    rows = store.query(sparql)
    return [int(row["wpTagId"]) for row in rows if row.get("wpTagId")]


def _count_story_cards(html: str) -> int:
    """Count story cards in the HTML returned by the stories page."""
    return html.count('<div class="col grid-3">')


def _build_stories_url(wp_ids: List[int], lang: str) -> str:
    """Construct the language-specific filtered stories URL from WP term IDs."""
    base = stories_base_url(lang)
    if not wp_ids:
        return base
    tags_param = ",".join(str(i) for i in wp_ids)
    return f"{base}?tag={tags_param}"


@router.get("/stories/count")
async def get_stories_count(
    tag: List[str] = Query(default=[]),
    lang: str = Query("en", pattern="^(en|de)$"),
    store: RDFStore = Depends(get_store),
):
    """Return the number of OceanCare stories matching the given tag IRIs."""
    if not tag:
        return {"count": 0, "url": stories_base_url(lang)}

    wp_ids = _resolve_wp_tag_ids(tag, store)
    if not wp_ids:
        return {"count": 0, "url": stories_base_url(lang)}

    filtered_url = _build_stories_url(wp_ids, lang)

    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            resp = await client.get(filtered_url)
        count = _count_story_cards(resp.text)
    except Exception as exc:
        logger.error("Failed to fetch story count from %s: %s", filtered_url, exc)
        return {"count": 0, "url": filtered_url}

    return {"count": count, "url": filtered_url}
