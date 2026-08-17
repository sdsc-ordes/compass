from fastapi import APIRouter, HTTPException, Body
from ..db import save_state, get_state
import json

router = APIRouter()

@router.post("/save")
async def save_map_state(data: dict = Body(...)):
    """Saves a map state (filters, zoom, center) and returns a short ID."""
    state_id = save_state(json.dumps(data))
    return {"id": state_id}

@router.get("/{state_id}")
async def fetch_map_state(state_id: str):
    """Retrieves a map state by its short ID."""
    state = get_state(state_id)
    if not state:
        raise HTTPException(status_code=404, detail="State not found")
    return json.loads(state["data"])
