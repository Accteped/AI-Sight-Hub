from app.store import Store
from app.llm.client import build_client
from app.config import Config
from app.pipeline import ingest

s = Store("test.db", "TEST")
c = build_client(Config())

# 用一个确定不存在的域名
result = ingest(s, "https://this-domain-does-not-exist.invalid/x", c)
print("ingest 返回:", result)

item_id = result[0]
r = s.get(item_id)
print("status:", r["status"])
print("error:", r["error"])