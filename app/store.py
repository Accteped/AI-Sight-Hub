import sqlite3
import json

class Store:
    #初始化数据库
    def __init__(self, db_path, dbtb_name):
        self.db_path = db_path
        self.dbtb_name = dbtb_name
        try:
            conn = sqlite3.connect(self.db_path)
        except sqlite3.Error as e:
            print(f"Error connecting to database: {e}")
            #raise(e)
        try:
            conn.execute(f"CREATE TABLE IF NOT EXISTS {self.dbtb_name} (" 
                    "id INTEGER PRIMARY KEY AUTOINCREMENT, "
                    "title TEXT NOT NULL DEFAULT '', "
                    "summary TEXT NOT NULL DEFAULT '', "
                    "content TEXT NOT NULL DEFAULT '', "
                "url TEXT NOT NULL DEFAULT '', "
                "model TEXT, "
                "provider TEXT ,"
                "category TEXT NOT NULL DEFAULT '其他', "
                "tags TEXT NOT NULL DEFAULT '[]',"
                "create_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, "
                "update_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, "
                "status TEXT NOT NULL DEFAULT 'pending', "
                "error TEXT DEFAULT NULL,"
                "source TEXT DEFAULT NULL,"
                "keywords TEXT DEFAULT '[]'"
                ")")
        except sqlite3.Error as e:
            print(f"Error creating table: {e}")
        conn.commit()
        conn.close()
    #把json安全解析成list
    def _to_list(self, text):
        value = []
        try:
            value = json.loads(text) if text else []
        except (json.JSONDecodeError, TypeError):
            return []
        return value if isinstance(value,list) else []
    #新增一条行
    def add(self, title = '', summary = '', content = '', url = '', model = '', provider = '', category = '其他', status='pending', keywords='[]', tags = '[]', error=None, source=None):
        conn_a = sqlite3.connect(self.db_path)
        try:
            conn_a.execute(f"INSERT INTO {self.dbtb_name} (title, summary, content, url, model, provider, category, tags, status, error, source, keywords) "
                        f"VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        (title, summary, content, url, model, provider, category, tags, status, error, source, keywords))
            id = conn_a.execute(f"SELECT last_insert_rowid() FROM {self.dbtb_name}").fetchone()[0]
        except sqlite3.Error as e:
            print(f"Error adding record: {e}")
            id = None
        conn_a.commit()
        conn_a.close()
        return id
    #根据id获取对应行，返回格式为dict
    def get(self, id):
        conn_g = sqlite3.connect(self.db_path)
        try:
            conn_g.row_factory = sqlite3.Row
            cursor = conn_g.execute(f"SELECT * FROM {self.dbtb_name} WHERE id=?", (id,))
            row = cursor.fetchone()
            if not row:
                return None
            rows = dict(row)
            rows["keywords"] = self._to_list(rows["keywords"])
            rows["tags"] = self._to_list(rows["tags"])
            record = dict(rows)
            return record
        finally:
            conn_g.close()
    #按照条件查询，传入参数为q、category、tag、limit，返回符合条件的记录列表
    def list(self, q, category, tag, limit):
        conn_l = sqlite3.connect(self.db_path)
        try:
            conn_l.row_factory = sqlite3.Row
            query = f"SELECT * FROM {self.dbtb_name} WHERE 1=1"
            params = []
            if q:
                query += " AND (title LIKE ? OR summary LIKE ? OR content LIKE ?)"
                params.extend([f"%{q}%"] * 3)
            if category:
                query += " AND category=?"
                params.append(category)
            if tag:
                query += " AND tags LIKE ?"
                params.append(f'%"{tag}"%')
            query += " ORDER BY create_at DESC"
            if limit:
                query += " LIMIT ?"
                params.append(limit)
            cursor = conn_l.execute(query, params)
            records = []
            for row in cursor.fetchall():
                rows = dict(row)
                rows["keywords"] = self._to_list(rows["keywords"])
                rows["tags"] = self._to_list(rows["tags"])
                records.append(dict(rows))
            return records
        finally:
            conn_l.close()
    #更新状态，传入参数为id、status、error
    def set_status(self, id, status, error=None):
        conn_s = sqlite3.connect(self.db_path)
        try:
            if error:
                conn_s.execute(f"UPDATE {self.dbtb_name} SET status=?, error=? WHERE id=?", (status, error, id))
            else:
                conn_s.execute(f"UPDATE {self.dbtb_name} SET status=?, error=? WHERE id=?", (status, None, id))
            conn_s.commit()
        finally:
            conn_s.close()
    #保存内容和标题，传入参数为id、content、title
    def save_content(self, id, content, title):
        conn_save = sqlite3.connect(self.db_path)
        try:
            conn_save.execute(f"UPDATE {self.dbtb_name} SET content=?, title=? WHERE id=?", (content, title, id))
            conn_save.commit()
        finally:
            conn_save.close()
    #进行对应的分析结果更新，传入参数为id、analysis对象、provider、model
    def apply_analysis(self, id, analysis, provider, model):
        conn_apply = sqlite3.connect(self.db_path)
        keywords = json.dumps(analysis.keywords)
        tags = json.dumps(analysis.tags)
        try:
            conn_apply.execute(f"UPDATE {self.dbtb_name} SET title=?, summary=?, model=?, provider=?, category=?, keywords=?, tags=?, error=?, status=?, update_at=CURRENT_TIMESTAMP WHERE id=?",
                                (analysis.title, analysis.summary,model, provider, analysis.category, keywords, tags, None, "done", id))
            conn_apply.commit()
        finally:
            conn_apply.close()
    #删除对应行
    def delete(self, id):
        conn_d = sqlite3.connect(self.db_path)
        change = 0
        #注意删除不存在的id不会抛异常，所以不能在外面无条件把stat定为True
        #判断方法：看execute返回的游标行是不是0
        try:
            cursor = conn_d.execute(f"DELETE FROM {self.dbtb_name} WHERE id=?", (id,))
            #如果没有删除任何行，说明id不存在，返回False
            change = cursor.rowcount
            conn_d.commit()
        finally:
            conn_d.close()
        return change > 0
    #统计类别数，返回格式为[{"name": "category1", "count": count1}, {"name": "category2", "count": count2}, ...]
    def categories(self):
        #连接数据库，获取所有记录的category字段
        conn_c = sqlite3.connect(self.db_path)
        conn_c.row_factory = sqlite3.Row
        cur = conn_c.execute(f"SELECT category,COUNT(*) FROM {self.dbtb_name} GROUP BY category ORDER BY COUNT(*) DESC")
        row = cur.fetchall()
        conn_c.close()
        #转化为[]
        cat = []
        for r in row:
            cat.append({"name": r['category'], "count": r['COUNT(*)']})
        return cat
    #统计total、done、failed、categories、tags类别数量，返回类型为dict，格式为{"total": total_count, "done": done_count, "failed": failed_count, "categories": categories_count, "tags": tags_count}
    def stats(self):
        #连接数据库
        conn_s = sqlite3.connect(self.db_path)
        conn_s.row_factory = sqlite3.Row
        cur = conn_s.execute(f"SELECT status,COUNT(*) FROM {self.dbtb_name} GROUP BY status ORDER BY COUNT(*) DESC")
        row = cur.fetchall()
        conn_s.close()
        #统计数量
        stats_count = {"total": 0, "done": 0, "failed": 0, "categories": 0, "tags": 0}
        rows = {r['status']: r['COUNT(*)'] for r in row}
        rows_c = self.categories()
        rows_t = self.tags()
        #分别记录
        stats_count["total"] = sum(rows.values())
        stats_count["done"] = rows.get("done", 0)
        stats_count["failed"] = rows.get("failed", 0)
        stats_count["categories"] = len(rows_c)
        stats_count["tags"] = len(rows_t)
        #返回 dict
        return stats_count
    #统计标签数，返回格式为{"name": "tag1", "count": count1}, {"name": "tag2", "count": count2}, ...}
    def tags(self):
        #连接数据库，获取所有记录的tags字段
        conn_t = sqlite3.connect(self.db_path)
        conn_t.row_factory = sqlite3.Row
        cur = conn_t.execute(f"SELECT tags FROM {self.dbtb_name}")
        rows = cur.fetchall()
        conn_t.close()
        #统计标签数量
        tag_count = {}
        for row in rows:
            tags = self._to_list(row["tags"])
            for tag in tags:
                if tag in tag_count:
                    tag_count[tag] += 1
                else:
                    tag_count[tag] = 1
        #把dict转化为[]
        tag_return = [{"name": tag, "count": count} for tag, count in tag_count.items()]
        return sorted(tag_return, key=lambda x: x['count'], reverse=True)
