import sqlite_utils
import uuid
import datetime
import os

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "states.db")

def get_db():
    db = sqlite_utils.Database(DB_PATH)
    if "states" not in db.table_names():
        db["states"].create({
            "id": str,
            "data": str,
            "created_at": str
        }, pk="id")
    return db

def save_state(data: str) -> str:
    db = get_db()
    state_id = str(uuid.uuid4())[:8]
    db["states"].insert({
        "id": state_id,
        "data": data,
        "created_at": datetime.datetime.now().isoformat()
    })
    return state_id

def get_state(state_id: str):
    db = get_db()
    try:
        return db["states"].get(state_id)
    except Exception:
        return None
