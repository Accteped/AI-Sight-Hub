from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.responses import JSONResponse,Response

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
        return JSONResponse(content={"error": "not found"}, status_code=404)
    return item

@app.post("/api/items")
def create_item(payload: ItemCreate):
    source = payload.url or payload.text

    if not source or not source.strip():
        return JSONResponse(content='输入为空',status_code=400)

    item_id, code = ingest(store, source, client)
 
    return JSONResponse(content=store.get(item_id), status_code=code)

@app.post("/api/items/{item_id}/reanalyze")
def reanalyze(item_id: int):
    item = store.get(item_id)
    if item is None:
        return JSONResponse(content={"error": "not found"}, status_code=404)
    temp_id, status = analyze(store, item_id, client)
    return JSONResponse(content=store.get(temp_id), status_code=status)

@app.delete("/api/items/{item_id}")
def delete(item_id: int):
    stats = store.delete(item_id)
    if not stats:
        return JSONResponse(content={"error": "not found"}, status_code=404)
    return Response(status_code=204)