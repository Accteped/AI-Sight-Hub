import app.fetcher
import app.models

SYSTEM_PROMPT = """你是一个专业的资料整理助手。请阅读用户提供的资料正文，输出严格的 JSON 对象。

字段要求：
{
  "title": "一句话标题，不超过 30 字",
  "summary": "3 句话以内的中文摘要，说明这篇资料讲了什么、对谁有用",
  "tags": ["3-6 个关键词标签，中文优先，用短词"],
  "category": "从这些里选一个：技术/编程、安全/CTF、产品/设计、学习/教程、生活/效率、其他",
  "keywords": ["2-5 个最核心的术语"]
}

约束：
- 忠于原文，不要编造原文没有的信息
- 标签要具体，例如用“FastAPI”而不是用“框架”
- category 必须从上面列出的选项中选一个，不要自创
- 只输出 JSON 对象本身，不要 markdown 代码块，不要任何解释文字
"""

def ingest(store, source, client, titles=None):
    #避免出现创建一个没有内容的数据
    if not source or not source.strip():
        raise ValueError('输入为空')
    status = "pending"
    item_id = store.add(status=status)
    try:
        text = source
        if app.fetcher.is_url(source):
            store.set_status(id=item_id, status="fetching")
            (titles,articles) = app.fetcher.fetch_article(source)
            text = titles + '\n' + articles
            store.save_content(item_id, content=articles, title=titles)
        else:
            store.save_content(item_id, content=text, title = titles or "")
        status = analyze(store, item_id, client)
    
    except Exception as e:
        store.set_status(id=item_id, status="failed", error=str(e)[:500])      
        return (item_id,422)
    return status

def analyze(store, item_id, client):
    try:
        item = store.get(item_id)
        if item is None:
            return (item_id,404)
        if not item["content"]:
            return (item_id,400)
        store.set_status(id= item_id, status = "analyzing")
        content = client.json(SYSTEM_PROMPT, item["content"])

        analysis = app.models.Analysis(**content)

        store.apply_analysis(item_id, analysis, client.name, client.model)
        return (item_id, 201)
    except Exception as e:
        store.set_status(id=item_id, status="failed", error=str(e)[:500])      
        return (item_id, 422)