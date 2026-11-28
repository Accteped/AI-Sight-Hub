from app.store import Store
from app.llm.client import build_client
from app.config import Config
from app.pipeline import ingest

s = Store("test.db", "TEST")
c = build_client(Config())

id1 = s.add(status="pending")
print(s.delete(id1))          # 期望 True   —— 真的删到了
print(s.delete(id1))          # 期望 False  —— 已经不存在
print(s.get(9999))            # 期望 None   —— 不存在（不是抛异常）
print(s.get(id1))             # 期望 None

# 用一个确定不存在的域名
result = ingest(s, "https://this-domain-does-not-exist.invalid/x", c)
print("ingest 返回:", result)

item_id = result[0]
r = s.get(item_id)
print("status:", r["status"])
print("error:", r["error"])