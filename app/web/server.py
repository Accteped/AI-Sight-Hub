from fastapi import FastAPI
from pydantic import BaseModel

from ..config import Config
from ..llm.client import build_client
from ..store import Store
from ..pipeline import ingest, analyze

app = FastAPI()
store = Store("test.db", "TEST")
client = build_client(Config())

class ItemCreate(BaseModel):
    url: str | None = None
    text: str | None = None
    title: str | None = None


@app.get("/")
def home():
    return {"hello": "AI Insight Hub"}

@app.get("/api/config")
def list_config():
    config = Config()
    return config.get_config()

@app.get("/api/items")
def list_items(q: str = "", category: str = "", tag: str = "", limit: int = 200):
    return store.list(q, category, tag, limit)

@app.get("/api/stats")
def stats():
    return store.stats()

@app.get("/api/categories")
def categories():
    return store.categories()

@app.get("/api/tags")
def get_tags(limit: int):
    return (store.tags())[:limit]

@app.get("/api/items/{item_id}")
def get_item(item_id: int):
    item = store.get(item_id)
    if item is None:
        return {"error": "not found"}, 404
    return item

@app.post("/api/items")
def create_item(payload: ItemCreate):
    source = payload.url or payload.text
    item_id, code = ingest(store, source, client)
    return store.get(item_id), code

@app.post("/api/items/{id}/reanalyze")
def reanalyze(id: int):
    item = store.get(id)
    if item is None:
        return {"error": "not found"}, 404
    status = analyze(store, id, client)
    return item, status