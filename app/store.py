import sqlite3
import json

db_path = "./data/test.db"
dbtb_name = "TEST"

def init(db_path,dbtb_name):
    try:
        conn = sqlite3.connect(db_path)
    except sqlite3.Error as e:
        print(f"Error connecting to database: {e}")
        return

    try:
        conn.execute(f"CREATE TABLE IF NOT EXISTS {dbtb_name} (" 
                 "id INTEGER PRIMARY KEY AUTOINCREMENT, "
                 "title TEXT NOT NULL DEFAULT '', "
                 "summary TEXT NOT NULL DEFAULT '', "
                 "content TEXT NOT NULL DEFAULT '', "
             "url TEXT NOT NULL DEFAULT '', "
             "model TEXT, "
             "provider TEXT ,"
             "category TEXT NOT NULL DEFAULT '其他', "
             "tag TEXT NOT NULL DEFAULT '[]',"
             "create_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, "
             "update_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, "
             "status TEXT NOT NULL DEFAULT 'pending', "
             "error TEXT DEFAULT NULL,"
             "source TEXT DEFAULT NULL,"
             "keywords TEXT DEFAULT '[]'"
             ")")
    except sqlite3.Error as e:
        print(f"Error creating table: {e}")
    conn.commit()
    conn.close()

def add(title, summary, content, url, model, provider, category, tag, status='pending', error=None, source=None, keywords=None):
    conn_a = sqlite3.connect(db_path)
    try:
        conn_a.execute(f"INSERT INTO {dbtb_name} (title, summary, content, url, model, provider, category, tag, status, error, source, keywords) "
                     f"VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                     (title, summary, content, url, model, provider, category, tag, status, error, source, keywords))
        id = conn_a.execute(f"SELECT last_insert_rowid() FROM {dbtb_name}").fetchone()[0]
    except sqlite3.Error as e:
        print(f"Error adding record: {e}")
        id = None
    conn_a.commit()
    conn_a.close()
    return id

def get(id):
    conn_g = sqlite3.connect(db_path)
    try:
        cursor = conn_g.execute(f"SELECT * FROM {dbtb_name} WHERE id=?", (id,))
        record = cursor.fetchone()
    except sqlite3.Error as e:
        print(f"Error retrieving record: {e}")
        record = None
    conn_g.close()
    return record

def list(q, category, tag, limit):
    conn_l = sqlite3.connect(db_path)
    try:
        query = f"SELECT * FROM {dbtb_name} WHERE 1=1"
        params = []
        if q:
            query += " AND (title LIKE ? OR summary LIKE ? OR content LIKE ?)"
            params.extend([f"%{q}%"] * 3)
        if category:
            query += " AND category=?"
            params.append(category)
        if tag:
            try:
                tags = json.loads(tag)
            except json.JSONDecodeError:
                tags = []
            query += " AND tag LIKE ?"
            params.append(f"%{tags}%")
        query += " ORDER BY create_time DESC"
        if limit:
            query += " LIMIT ?"
            params.append(limit)
        cursor = conn_l.execute(query, params)
        records = cursor.fetchall()
    except sqlite3.Error as e:
        print(f"Error listing records: {e}")
        records = []
    conn_l.close()
    return records

def set_status(id, status, error=None):
    conn_s = sqlite3.connect(db_path)
    try:
        if error:
            conn_s.execute(f"UPDATE {dbtb_name} SET status=?, error=? WHERE id=?", (status, error, id))
        else:
            conn_s.execute(f"UPDATE {dbtb_name} SET status=? WHERE id=?", (status, id))
    except sqlite3.Error as e:
        print(f"Error updating status: {e}")
    conn_s.commit()
    conn_s.close()

def save_content(id, content, title):
    conn_save = sqlite3.connect(db_path)
    try:
        conn_save.execute(f"UPDATE {dbtb_name} SET content=?, title=? WHERE id=?", (content, title, id))
    except sqlite3.Error as e:
        print(f"Error saving content: {e}")
    conn_save.commit()
    conn_save.close()

def apply_analysis(id, analysis, provider, model):
    conn_apply = sqlite3.connect(db_path)
    keywords = json.dumps(analysis.keywords)
    tags = json.dumps(analysis.tags)
    try:
        conn_apply.execute(f"UPDATE {dbtb_name} SET title=?, summary=?, model=?, provider=?, category=?, keywords=?, tag=? WHERE id=?",
                            (analysis.title, analysis.summary,model, provider, analysis.category, keywords, tags, id))
    except sqlite3.Error as e:
        print(f"Error applying analysis: {e}")
    conn_apply.commit()
    conn_apply.close()

def delete(id):
    conn_d = sqlite3.connect(db_path)
    stat = True
    try:
        conn_d.execute(f"DELETE FROM {dbtb_name} WHERE id=?", (id,))
    except sqlite3.Error as e:
        print(f"Error deleting record: {e}")
        stat = False
    conn_d.commit()
    conn_d.close()
    return stat
#统计类别数，返回格式为[{"name": "category1", "count": count1}, {"name": "category2", "count": count2}, ...]
def categories():
    #连接数据库，获取所有记录的category字段
    conn_c = sqlite3.connect(db_path)
    conn_c.row_factory = sqlite3.Row
    list = conn_c.execute(f"SELECT category,COUNT(*) FROM {dbtb_name} GROUP BY category ORDER BY COUNT(*) DESC")
    row = list.fetchall()
    conn_c.close()
    #转化为[]
    cat = []
    for r in row:
        cat.append({"name": r['category'], "count": r['COUNT(*)']})
    return cat
#统计total、done、failed、categories、tags数量，返回类型为dict，格式为{"total": total_count, "done": done_count, "failed": failed_count, "categories": categories_count, "tags": tags_count}
def stats():
    #连接数据库
    conn_s = sqlite3.connect(db_path)
    conn_s.row_factory = sqlite3.Row
    list = conn_s.execute(f"SELECT status,COUNT(*) FROM {dbtb_name} GROUP BY status ORDER BY COUNT(*) DESC")
    row = list.fetchall()
    conn_s.close()
    #统计数量
    stats_count = {"total": 0, "done": 0, "failed": 0, "categories": 0, "tags": 0}
    rows = dict(row)
    rows_c = categories()
    rows_t = tags()
    #分别记录
    stats_count["total"] = sum(rows.values())
    stats_count["done"] = rows.get("done", 0)
    stats_count["failed"] = rows.get("failed", 0)
    stats_count["categories"] = sum([cat["count"] for cat in rows_c])
    stats_count["tags"] = sum([tag["count"] for tag in rows_t])
    #返回 dict
    return stats_count
#统计标签数，返回格式为{"name": "tag1", "count": count1}, {"name": "tag2", "count": count2}, ...}
def tags():
    #连接数据库，获取所有记录的tag字段
    conn_t = sqlite3.connect(db_path)
    conn_t.row_factory = sqlite3.Row
    list = conn_t.execute(f"SELECT tag FROM {dbtb_name}")
    rows = list.fetchall()
    conn_t.close()
    #统计标签数量
    tag_count = {}
    for row in rows:
        tags = json.loads(row['tag'])
        for tag in tags:
            if tag in tag_count:
                tag_count[tag] += 1
            else:
                tag_count[tag] = 1
    #把dict转化为[]
    tag_return = [{"name": tag, "count": count} for tag, count in tag_count.items()]
    return tag_return
if __name__ == "__main__":
    init(db_path, dbtb_name)