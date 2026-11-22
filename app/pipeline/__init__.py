import app.fetcher

def ingest(store, source, title=None, client=None):
    status = "pending"
    item_id = store.add(status=status)
    try:
        text = source
        if app.fetcher.is_url(source):
            store.set_status(id=item_id, status="fetching")
            (titles,articles) = app.fetcher.fetch_article(source)
            text = titles + '\n' + articles
            store.save_content(item_id, content=articles, title=titles)
        store.set_status(id=item_id, status="analyzing")
        content = client.complete(text)

        store.set_status(id=item_id, status="done")
    except Exception as e:
        store.set_status(id=item_id, status="failed", error=e)      
