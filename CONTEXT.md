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
阶段 4  流水线         ✅  app/pipeline/__init__.py
阶段 5  接口层         ✅  app/web/server.py，验收已达标（201/400/404/422/204）
阶段 6  前端           ⬜  0 文件，静态目录未挂载
阶段 7  接真模型       ⬜  OpenAICompatClient / OllamaClient 仍是 pass
阶段 8  打磨           ⬜
```

**阶段 5 验收实测**（2026-11-27）：POST 文本 → 201 + 条目；POST 空输入 → 400；
POST 假域名 → 422 + 条目（status=failed、error 有内容）；GET/reanalyze 不存在 → 404；
DELETE 存在 → 204、不存在 → 404。全部符合 spec 第 7 节契约。

---

## 3. 各模块现状

### store.py
- `Store(db_path, dbtb_name)` 类，构造时建表
- 列名：`id title summary content url model provider category tags create_at update_at status error source keywords`
  （注意是 `tags` 复数、`create_at` 非 `created_at`，与文档有出入）
- `_to_list(text)`：**读取侧**安全解析 JSON 字段。`json.loads` 后校验 `isinstance(value, list)`，
  非 list（如 `'null'`→None、`'123'`→int、`'"abc"'`→str）统一返回 `[]`
- `get()` / `list()` 返回 dict，`tags`/`keywords` 经 `_to_list` 转列表
- **所有方法异常向上抛出**：已删除吞错的 `except sqlite3.Error`，数据库错误不再伪装成
  “不存在/空列表”；`finally: close()` 保证连接一定关闭，`commit()` 在 `try` 内
- `add()` 所有参数有默认值；`tags`/`keywords` 默认仍是字符串 `'[]'`（**与 `Analysis` 的 list 约定不一致，见第 4 节**）
- `apply_analysis()` 写分析结果 + `status='done'` + `error=None` + `update_at`；
  `keywords` 的 `json.dumps` **缺 `ensure_ascii=False`**
- `delete()` 用 `cursor.rowcount` 判断影响行数（`Total_changes` 语义不准，已替换）；返回 bool
- 构造函数建表失败时仍有 `except` 吞错（隐患，见第 4 节）

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
- `clean_recv(text)` 模块级函数（**写入侧**清洗），处理 5 种输入：
  `None`→`[]`；`str` 先试 `json.loads`（成功且是 list 就用，否则当单个标签）；
  `list`/`tuple`→逐项 `str()` 并过滤空白；其他类型→`[]`
- `Analysis`：`title/summary/category`（str）+ `tags/keywords`（list）。
  **默认值改为 `None` 哨兵**，经 `clean_recv` 转换，避免可变默认参数在实例间共享
- **`Item` 未写**，留到接口层需要时再补

### pipeline/__init__.py
- `SYSTEM_PROMPT` 模块常量（角色 + 5 字段 + 分类候选值 + 只输出 JSON）
- `ingest(store, source, client)`：空输入 `raise ValueError` → add(pending) → 抓取(fetching) → analyze
- `analyze(store, item_id, client)`：查 item → 检查 content → client.json → Analysis → apply_analysis；
  **四个分支统一返回 `(item_id, code)`**（404/400/201/422）
- `ingest` 成功路径 `return status`（即 analyze 的返回值，平的 `(item_id, 201)`），失败路径 `(item_id, 422)`
- 已验证：纯文本 201、失败路径 422 + `status=failed` + error 有内容

### web/server.py
- 接口：`GET /` `/api/config` `/api/items` `/api/stats` `/api/categories` `/api/tags` `/api/items/{item_id}`、
  `POST /api/items`、`POST /api/items/{item_id}/reanalyze`、`DELETE /api/items/{item_id}`
- **状态码一律用 `JSONResponse(content=..., status_code=...)` 或 `Response(status_code=...)` 表达**；
  FastAPI **不支持** `return data, code` 的元组约定（那是 Flask 的写法），写成元组会得到
  HTTP 200 + 响应体 `[data, code]`
- `create_item` 先在接口层校验空输入返回 400，再调 `ingest`；`reanalyze` 在 analyze **之后**重查条目再返回
- `delete` 直接删并看返回值，成功 `Response(status_code=204)`（无 body），没删到 → 404
- 启动：`.\.venv\Scripts\python.exe -m uvicorn app.web.server:app --reload --port 8000`
- **必须用 `-m` 方式**，直接跑文件会导致相对导入失败
- **注意**：`/` 还返回 `{"hello": ...}`，静态目录未挂载，阶段 6 未开始

---

## 4. 当前待修（按优先级）

> 上一批（P0 content 不落库、P1 reanalyze 旧数据、路径参数 `{id}`、接口状态码元组、
> 存储层吞异常、`total_changes`、可变默认参数）**已全部修复并提交**（44004d8 / 2a527dc）。

### 🔴 P0 功能缺失：`MockClient` 不产出 `keywords`
`MockClient.complete` 的输出 dict 只有 `title/summary/tags/category`，缺 `keywords`。
`Analysis(**content)` 拿不到该字段 → 用默认 `[]` → **所有条目 keywords 永远是空数组**，
前端关键词区一片空白。
接真模型时自然解决（真模型会按 `SYSTEM_PROMPT` 返回 5 个字段），仅影响 mock 模式下的界面观感。

### 🟡 P1 隐患：`Store.__init__` 吞建表错误
```python
except sqlite3.Error as e:
    print(f"Error creating table: {e}")
```
建表失败只 print，`Store` 对象照常返回，后续所有操作都在一个没有表的结构上执行。
其余方法的吞错都已删除，只剩这一处。

### 🟡 P2 一致性：`add()` 收字符串 vs `Analysis` 收 list
`add(tags='[]', keywords='[]')` 默认传字符串，`apply_analysis()` 传 list 再 `json.dumps`。
**同字段两套约定**，长期应统一为“代码里一律 list，入库时 dumps”。

### 🟡 P3 清理项
- `apply_analysis()` 的 `json.dumps(analysis.keywords)` **缺 `ensure_ascii=False`**（tags 那行有）
- `get()` 里 `rows = dict(row)` 后又有 `record = dict(rows)`，多余复制，可直接 `return rows`
- `clean_recv` 与 `_to_list` 功能相近（一个清洗写入、一个防御读取），**暂不合并**；
  等写入侧稳定后 `_to_list` 可简化
- 库里历史脏数据：`keywords` 曾以 `'"[]"'`（JSON 字符串）形式存入，`_to_list` 会判为
  非 list 返回 `[]`（不崩但丢数据）。如需修正，写一次性脚本把 `'"[]"'` 改成 `'[]'`
- `scripts/smoke_test.py` 的检查是 `print` 期望值而非断言，**失败不会让脚本以非零码退出**；
  且只覆盖失败路径 + 删除，未覆盖文本入库 201 / 查询 / 统计
- 接口错误体是 `{"error": ...}`，spec §7.3 统一格式是 `{"detail": ...}`
- 字段名与 spec §7.2 示例不一致：库里是 `create_at/update_at/source`，文档写 `created_at/updated_at/source_type`
- `Ingest` 在 URL 分支拼了 `text = titles + '\n' + articles` 却没用（死变量）
- URL 条目的 `url` 字段从未落库（实测假域名条目 `"url": ""`）
- `clean_content()` 从未被调用，长文全量灌给 LLM
- `/api/tags` 的 `limit` 参数无默认值，不传即 422
- `pyproject.toml` 的依赖里已无 pymysql/cryptography（决策第 5 节仍保留该条，无需再改）

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
3. **改 A 弄坏 B**。修 `tags()` 返回结构时把排序删了；修 `Analysis` 默认值类型时
   把 `'[]'` 换成 `[]`，结果引入了可变默认参数共享。改完要重跑清单。
4. **失败伪装成成功**（最反复）：`delete()` 永远 True、`except` 吞错、`return ValueError` 而非 `raise`、
   `decode_to_json` 返回空串、`add()` 出错返回 None、`get()` 出错伪装成“不存在”。
5. **写完必须立刻跑**。不跑就继续改，等于在盲改。

### 框架认知类坑（这次踩到的）
| 坑 | 现象 | 解法 |
|---|---|---|
| **FastAPI 不支持元组返回** | `return data, 404` → HTTP 200 + body `[data, 404]` | 用 `JSONResponse(content, status_code)` 或 `Response(status_code)`；元组约定是 Flask 的 |
| 一个变量接多返回值 | `status = analyze(...)` 得到 `(id, 201)` 而非 `201`，再包一层就成了嵌套元组 | 解包 `a, b = f()`，或让函数直接返回单个值 |
| 类方法漏 `self` | `TypeError: takes 1 positional argument but 2 were given` | 类里定义的方法第一参数是 `self`；不需要 `self` 的放模块级 |
| 删 `except` 里的赋值 ≠ 让异常抛出 | `except` 块还在，异常就被拦住了；删掉 `stat = False` 反而让 `True` 默认值生效，错误伪装成成功 | 要抛就写 `raise`，或整个删掉 `except` 只留 `try/finally` |
| 用坏表名测“异常是否抛出”测不准 | 错误发生在构造函数建表时，方法里的 try 根本走不到 | 建好表再 `DROP TABLE`，或操作已存在的库使其在 `execute` 时报错 |

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
| `text.strip` 漏括号 | 取到方法对象，恒为真，空串过滤失效 | `text.strip()` |
| `json.loads` 返回值类型不定 | `'null'`→None、`'123'`→int、`'"abc"'`→str | 解析后 `isinstance(x, list)` 再决定 |
| `total_changes` 是连接累计值 | 前面若有其它写操作则判断错误 | 用 `cursor.rowcount` |

---

## 7. 环境事实

- `.venv` 的 Python 3.14.7，依赖已装（fastapi/httpx/trafilatura/bs4/python-dotenv）
- **pytest 未安装，`tests/` 目录不存在**，目前靠手工脚本验证
- Windows 控制台默认 GBK：脚本输出中文/emoji 需 `sys.stdout.reconfigure(encoding="utf-8")`
- **VS Code 解释器可能不是 `.venv`**，注意右下角切换
- pip 退出码非 0 但可能已装成功，**以能否 import 为准**
- `.gitignore` 已包含 `.env`/`.venv/`/`*.db`/`data/`/缓存
- **仓库已提交干净**：HEAD `8b20c5f`，无未跟踪文件。
  注意有两个生成物仍在版本控制里（历史遗留，待决定是否 `git rm --cached`）：
  `__pycache__/main.cpython-314.pyc`、`ai_insight_hub.egg-info/`（5 个文件）
- `数据库格式` 在项目根目录（曾计划放 `data/`，`data/` 现为空目录且被 ignore）
- 技能装在用户级 `C:\Users\accte\.agents\skills\`（`find-skills` 已可用）；仓库内 `.agents/`、`skills-lock.json` 是 skills CLI 的产物，位置不在 `.tools_external/`，是否迁移待用户定
- 项目已 `pip install -e .`（`ai-insight-hub 0.1.0`），因此 `import app...` 在任何 cwd 都可用；
  `python -m scripts.smoke_test` 与 `python scripts\smoke_test.py` 两种跑法都能成功

---

## 8. 下一步

```
1. 阶段 6 前端（单页，静态目录挂载 + / 返回 index.html）
   注意：XSS 转义、mock 标签显眼标出、422 时刷新列表、204 不能调 res.json()
2. 阶段 7 接真模型（OpenAICompatClient / OllamaClient 目前是 pass）
3. 深化测试：pytest 未装，先把手写脚本改成真断言
4. 清理 P1-P3（构造函数吞错、add/apply_analysis 两套约定、ensure_ascii、错误体格式）
```

**接真模型的优先级说明**：Mock 标签是碎片、且不产出 keywords，
做前端前接上真模型能避免基于假数据设计界面。
但阶段 5 已验证闭环，也可以先做前端骨架再换模型。

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
- **回答“改好了吗”之前必须重新读取文件和实测**：不能凭记忆或上一轮的印象断言已修/未修，
  多次出现过把已修项说成未修（或反之）的情况
- **提交**：用户明确说“提交/commit”时由 agent 执行 `git add`/`git commit` 并回报结果；
  未明确要求时不得自行提交；拆分方式先与用户确认，保证每个提交可运行

### 自查清单（每个存储层函数写完过一遍）
```
□ 空数据/空参数会怎样？
□ 查/删不存在的 id 会怎样？
□ 返回结构与文档一致吗（字段名、类型）？
□ 列表字段存进去再读出来还是列表吗？
□ 失败时调用方知道吗（有没有 except 吞掉）？
□ 该变的字段变了吗（如 status → done）？
```

### 排查接口时的自查清单
```
□ 状态码是装饰器/Response 真的设的，还是靠元组"以为"设的？（FastAPI 必须显式构造）
□ 抓包看的就是真实状态码和响应体形状，而不是只看"没报错"？
□ 成功路径和失败路径的返回结构是否一致（别只测其中一条）？
□ 异常真的抛到调用方了吗？（用 DROP TABLE 这类方法主动制造错误来验证）
□ 正常结果与系统错误是否用了不同的表达方式（返回值 vs 异常）？
```
