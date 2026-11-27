# AgentForNotes — 项目上下文（精简版）

> 跨会话记忆。开始开发前先读这份。理论讲解已删除，只留状态、待修项、决策。
> 详细需求见 `D:\Code\AI-Insight-Hub-开发文档.md`。

---

## 1. 项目

| 项 | 内容 |
|---|---|
| 名称 | AI Insight Hub / AgentForNotes |
| 路径 | `D:\Accepted\Project\AgentForNotes` |
| 功能 | 贴网址或文本 → 抓取 → AI 摘要/标签/分类 → SQLite → Web 浏览 |
| 定位 | 个人作品集，**作者本人从零实现**；AI 只指出问题，不代写代码 |
| 栈 | FastAPI + 原生 JS + SQLite + httpx + trafilatura + 可插拔 LLM |

---

## 2. 进度

```
阶段 0  地基           ✅
阶段 1  存储层         ✅  app/store.py
阶段 2  模型抽象层     ✅  app/llm/client.py + app/config.py
阶段 3  抓取与抽取     ✅  app/fetcher.py
阶段 4  流水线         ✅  app/pipeline/__init__.py（有 bug，见第 4 节）
阶段 5  接口层         🔄  app/web/server.py 已能启动，待修 bug
阶段 6  前端           ⬜
阶段 7  接真模型       ⬜  OpenAICompatClient / OllamaClient 仍是 pass
阶段 8  打磨           ⬜
```

---

## 3. 各模块现状

### store.py
- `Store(db_path, dbtb_name)` 类，构造时建表
- 列名：`id title summary content url model provider category tags create_at update_at status error source keywords`
  （注意是 `tags` 复数、`create_at` 非 `created_at`，与文档有出入）
- `get()` / `list()` 返回 dict，`tags`/`keywords` 已 `json.loads` 转列表
- `add()` 所有参数有默认值；**`tags`/`keywords` 默认字符串 `'[]'`**
- `apply_analysis()` 写分析结果 + `status='done'` + `error=None` + `update_at`
- `delete()` 用 `total_changes` 判断是否真删到

### llm/client.py
- `decode_to_json()`：先 `json.loads`，失败则配对计数抠最外层 `{}`，全失败抛 `ValueError`
- `LLMClient(ABC)`：`complete` 抽象（返回 str），`json` 非抽象（调 complete + decode）
- `MockClient`：`re.split` 切句造结果。**标签质量很差**（碎片、重复、带换行），仅够跑通流程
- `OpenAICompatClient` / `OllamaClient`：`pass` 空壳
- `build_client(CONFIG)`：三分支 + else raise

### config.py
- `Config` 类，`load_dotenv()` + `os.getenv`
- `LLM_TIMEOUT`/`LLM_TEMPERATURE` 用 `float()` 转
- **provider 决定 model 和 base_url**：mock → `mock-rules-v1` + 空 base_url；ollama → OLLAMA_MODEL/URL；其他 → LLM_MODEL/base_url
- `get_config()` 只返回 `has_key: bool`，不返回 key

### fetcher.py
- `is_url()`：`urlparse` 判断 scheme，已验证 None/纯文本/无域名都返回 False
- `fetch_html()`：浏览器 UA、流式分块、**5MB 上限**、编码降级、异常包装成可读错误
- `html_to_text()`：trafilatura + `<p>` 兜底，**取较长者**（实测菜鸟教程 trafilatura 只抽 827 字符，兜底拿回 2008）
- `fetch_article()`、`clean_content(text, limit)`

### models.py
- 只有 `Analysis`：`title/summary/category`（str）+ `tags/keywords`（list，默认 None 再转 `[]`）
- **`Item` 未写**，留到接口层需要时再补

### pipeline/__init__.py
- `SYSTEM_PROMPT` 模块常量（角色 + 5 字段 + 分类候选值 + 只输出 JSON）
- `ingest(store, source, client)`：空输入检查 → add(pending) → 抓取(fetching) → analyze → 返回 `(item_id, code)`
- `analyze(store, item_id, client)`：查 item → 检查 content → client.json → Analysis → apply_analysis
- 已验证：纯文本入库成功、失败路径 `(id, 422)` + `status=failed` + error 有内容

### web/server.py
- 已启动成功。已有接口：`GET /` `/api/config` `/api/items` `/api/stats` `/api/categories` `/api/tags` `/api/items/{id}`、`POST /api/items`、`POST /api/items/{id}/reanalyze`
- 启动：`.\.venv\Scripts\python.exe -m uvicorn app.web.server:app --reload --port 8000`
- **必须用 `-m` 方式**，直接跑文件会导致相对导入失败

---

## 4. 当前待修（按优先级）

### 🔴 P0 致命：纯文本输入的 content 从未写库
`ingest` 里纯文本分支只设了局部变量 `text`，没调 `store.save_content()`。
`analyze` 去库里读 `item["content"]` → 空 → `return 400`。
**结果：所有纯文本输入都分析失败。**

修法：文本分支补 `store.save_content(item_id, text, "")`。

### 🔴 P1 功能错误：reanalyze 返回旧数据
```python
item = store.get(id)          # 分析前查
status = analyze(store, id, client)
return item, status           # 返回的是旧数据
```
修法：analyze 之后再查一次再返回。

### 🟡 P2 清理项
- `server.py` 第 4 行 `from app.pipeline import analyze` 与第 8 行 `from ..pipeline import ingest` 重复且风格不一 → 合并为 `from app.pipeline import analyze, ingest`
- 路径参数 `{id}` 改为 `{item_id}`（`id` 遮蔽内置函数），与 `get_item` 一致

### 🟡 P3 store.py 技术债
- `get()`/`list()` 的 `json.loads` 后应校验结果是 `list`，否则 `json.loads("null")` 会返回 None
- `apply_analysis()` 的 `json.dumps` 缺 `ensure_ascii=False`（中文变转义码）
- `delete()` 改用 `cursor.rowcount`（`total_changes` 是连接累计值，靠“每次新连接”碰巧正确）
- `get()` 与 `list()` 转换逻辑重复，应抽 `_row_to_dict()`
- `add()` 收字符串 vs `apply_analysis()` 收列表，**同字段两套约定**，长期应统一为“代码里一律列表，入库时 dumps”

---

## 5. 关键决策（别再推翻）

| 决策 | 结论 |
|---|---|
| 数据库 | SQLite，**删掉 pyproject 里的 pymysql/cryptography** |
| ID | 删除后不重排、不复用 |
| `get()` 返回 | dict 或 None（`Item` 类延后） |
| `list()` 返回 | dict 列表，空时 `[]` |
| 密钥 | 只在 `.env`，不入库不入 git；`/api/config` 只给 `has_key` |
| `provider`/`model` | 写入数据库，作为“当时用了什么”的历史记录 |
| Mock 标准 | **不崩 + 结构对**，不追求标签准确 |
| 抽象 | 只用在 LLM 层；`Store` 不做抽象 |
| 失败 | **尽早抛异常**，绝不把错误伪装成返回值 |
| 同步/异步 | v1 同步 |
| 422 语义 | “条目已入库但分析失败”，**必须返回条目体**；无正文等前置条件不满足用 400 |

---

## 6. 反复踩的坑（复盘重点）

### 五个结构性教训
1. **测试 ≠ 没崩**。多次“测试过了”实际只验证没报错，没验证类型/结构对不对。
2. **同一错误反复出现 = 没理解**，只是在模仿语法（如 `dict(row)` 出现三次）。
3. **改 A 弄坏 B**。修 `tags()` 返回结构时把排序删了。改完要重跑清单。
4. **失败伪装成成功**（最反复）：`delete()` 永远 True、`except` 吞错、`return ValueError` 而非 `raise`、`decode_to_json` 返回空串。
5. **写完必须立刻跑**。不跑就继续改，等于在盲改。

### 具体坑位（精选）
| 坑 | 现象 | 解法 |
|---|---|---|
| 游标没 fetchall | 返回 `<Cursor object>` | 先 fetchall 再 close |
| `row_factory` 设在 cursor | AttributeError | 设在 **connection** 上、execute 之前 |
| `sqlite3.Row` 只读 | 无法赋值 | 先 `dict(row)` 再改 |
| `DEFAULT '[]'` 不救 None | NOT NULL 报错 | DEFAULT 只管“没传”，传 None 依然存 NULL |
| `except KeyError` 捕 JSON 错 | 该崩的还是崩 | `json.JSONDecodeError` |
| 裸 `except:` | 吞掉 Ctrl+C | 指定异常类型 |
| `str.split` 多分隔符 | 只按第一个切 | `re.split(r'[。.、，,]', s)` |
| 取最后一个 `{}` | 嵌套 JSON 外层丢失 | 配对计数、归零截断 |
| `os.getenv` 返回字符串 | timeout 有时 str 有时 int | `float(...)`，默认值也写字符串 |
| `== None` | `.env` 空值返回 `''` 漏判 | 用 `not x` |
| 相对导入点数 | ImportError | 包外引用用 `from app.xxx`；运行用 `-m` |
| `x<2 and x>10` | 永假 | 用 `or` |
| 可变默认参数 | 实例共享列表 | `None` 再转 `[]` |
| 变量名遮蔽 `list` | 后续调用报错 | 改名 `cur` |

---

## 7. 环境事实

- `.venv` 的 Python 3.14.7，依赖已装（fastapi/httpx/trafilatura/bs4/python-dotenv）
- **pytest 未安装，`tests/` 目录不存在**，目前靠手工脚本验证
- Windows 控制台默认 GBK：脚本输出中文/emoji 需 `sys.stdout.reconfigure(encoding="utf-8")`
- **VS Code 解释器可能不是 `.venv`**，注意右下角切换
- pip 退出码非 0 但可能已装成功，**以能否 import 为准**
- `.gitignore` 已包含 `.env`/`.venv/`/`*.db`/`data/`/缓存
- 未跟踪文件：`fetcher.py`、`models.py`、`CONTEXT.md`、`AGENTS.md`、`.agents/`、`skills-lock.json`、`data/数据库格式` 尚未提交
- 技能装在用户级 `C:\Users\accte\.agents\skills\`（`find-skills` 已可用）；仓库内 `.agents/`、`skills-lock.json` 是 skills CLI 的产物，位置不在 `.tools_external/`，是否迁移待用户定

---

## 8. 下一步

```
1. 修 P0（纯文本 content 不落库）→ 跑通文本输入的 201
2. 修 P1（reanalyze 返回旧数据）
3. 用 /docs 测三条边界：空输入 400、不存在 id 404、假域名 422 带条目体
4. 写 scripts/smoke_test.py（临时库，五项：工具函数/文本入库/查询统计/失败路径/删除）
5. 阶段 6 前端（单页，注意 XSS 转义、mock 标识、422 时刷新列表）
6. 阶段 7 接真模型（写 OpenAICompatClient.complete 七步）
```

**接真模型的优先级说明**：Mock 标签是碎片（66 个乱码标签），做前端前接上真模型能避免基于假数据设计界面。

---

## 9. 协作约定

已固化进 `AGENTS.md` 的 **Hard constraints** 节（用户指定，无例外）：
1. 未经允许不改用户的任何代码（每次改动单独同意）
2. 不私自改动代码/文件结构
3. 外部工具一律放 `.tools_external/`
4. 用户提问时：先总结问题暴露出的缺陷 → 再讲解该问题；**只有用户直接要方案时才给代码**

其余约定：
- **不代写代码**，只指出问题；概念讲不清时跳出项目用独立例子
- 问题分级：会崩的 / 逻辑错的 / 隐患
- 强调验证方式，警惕“没跑就说测试过了”
- 写完一个函数立刻跑一次，再写下一个

### 自查清单（每个存储层函数写完过一遍）
```
□ 空数据/空参数会怎样？
□ 查/删不存在的 id 会怎样？
□ 返回结构与文档一致吗（字段名、类型）？
□ 列表字段存进去再读出来还是列表吗？
□ 失败时调用方知道吗（有没有 except 吞掉）？
□ 该变的字段变了吗（如 status → done）？
```
