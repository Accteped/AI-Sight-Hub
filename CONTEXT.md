# AgentForNotes — 项目上下文文档

> **用途**：跨会话/跨上下文的项目记忆。任何时候开始继续开发，先读这份文档。
> **维护规则**：进度变化、决策变更、新踩的坑，都更新到这里。
> **最后更新**：阶段 2 完成时

---

## 0. 快速索引

- [1. 项目基本信息](#1-项目基本信息)
- [2. 技术选型](#2-技术选型)
- [3. 环境事实](#3-环境事实)
- [4. 进度状态](#4-进度状态)
- [5. 已完成模块定稿](#5-已完成模块定稿)
- [6. 踩过的坑](#6-踩过的坑)
- [7. 关键决策](#7-关键决策)
- [8. 待办清单](#8-待办清单)
- [9. 挂起问题](#9-挂起问题)
- [10. 协作约定](#10-协作约定)

---

## 1. 项目基本信息

| 项 | 内容 |
|---|---|
| 项目名 | AI Insight Hub / AgentForNotes |
| 代码路径 | `D:\Accepted\Project\AgentForNotes` |
| 开发文档 | `D:\Code\AI-Insight-Hub-开发文档.md`（921 行，15 章，需求与设计的权威来源） |
| 目标 | 抓取网页/文本 → AI 摘要、打标签、分类 → 存入知识库 → Web 界面浏览搜索 |
| 定位 | 个人作品集项目，**由作者本人从零实现** |
| 技术栈 | FastAPI + 原生 HTML/CSS/JS + SQLite + 可插拔 LLM |

### 产品闭环

```
用户粘贴网址/文本
   ↓
抓取并抽取正文
   ↓
调用大模型生成 标题/摘要/标签/分类
   ↓
落库
   ↓
Web 界面浏览、搜索、筛选
```

---

## 2. 技术选型

| 层 | 选择 | 理由 |
|---|---|---|
| 后端 | **FastAPI** | 自动 `/docs`、pydantic 校验、异步友好 |
| 前端 | **原生 HTML/CSS/JS** | 零构建、单页够用、不分心 |
| 存储 | **SQLite** | 单文件、零部署、单人本机够用 |
| HTTP 客户端 | **httpx** | 现代 API |
| 正文抽取 | **trafilatura** + **beautifulsoup4** | 前者质量高，后者兜底 |
| LLM | **可插拔**：mock / OpenAI 兼容 / Ollama | 见下 |
| 配置 | **python-dotenv** + 环境变量 | 密钥不入库、不入 git |
| 测试 | **pytest** | 标准选择 |

### 模型三方案

| 方案 | 成本 | 用途 |
|---|---|---|
| **mock**（规则模拟） | 免费 | **开发/测试默认**，不联网不要 Key |
| **云端 API**（OpenAI 兼容） | 极低，多有免费额度 | 日常主力 |
| **Ollama 本地** | 免费 | 离线演示分支 |

**开发顺序**：mock 先跑通 → 再接云端 → 最后本地。

### 云端服务商参考（改 Base URL + 模型名即可切换）

| 服务商 | Base URL | 模型名示例 |
|---|---|---|
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` |
| 硅基流动 | `https://api.siliconflow.cn/v1` | `Qwen/Qwen2.5-7B-Instruct` |
| 阿里百炼 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |

> ⚠️ 智谱是 `/v4` 不是 `/v1`，所以 `/v1` **不能写死在拼接代码里**。

---

## 3. 环境事实

| 项 | 实际情况 | 备注 |
|---|---|---|
| Python | 3.14.7 | FastAPI/pydantic/httpx/trafilatura/chromadb/torch 2.15 **均有 wheel** |
| GPU | RTX 5060 Laptop | **实际 8GB 显存**（CIM 的 `AdapterRAM` 报 4GB，符号位问题不准，以 `nvidia-smi` 为准） |
| 内存 | 15.7 GB | 够用 |
| CPU | i9-14900HX，32 线程 | 纯 CPU 跑小模型可行但慢 |
| Node | v24.20.0 | **本项目不需要** |
| WSL | Ubuntu-26.04（已装未用） | 第一版不用 |
| 已装全局包 | 仅 numpy、pillow | 用 venv 隔离 |

### Windows 特有陷阱

1. **控制台默认 GBK**：`print` 中文/emoji 抛 `UnicodeEncodeError`。修复：入口处 `sys.stdout.reconfigure(encoding="utf-8")`
2. **pip 退出码非 0 但可能已装成功**（stderr 有警告）。**判断标准是能否 `import`，不是退出码**
3. **VS Code 解释器可能不是 `.venv`**：截图显示调试器跑的是 uv 的 Python 3.13，与项目 `.venv` 不一致，会导致装了包却找不到。**右下角切到 `.venv`**

---

## 4. 进度状态

```
阶段 0  地基            ✅ 完成
阶段 1  存储层          ✅ 完成    app/store.py
阶段 2  模型抽象层      ✅ 完成    app/llm/client.py + app/config.py
阶段 3  抓取与抽取      ⬜ 未开始  fetcher.py
阶段 4  流水线          ⬜ 未开始  pipeline/
阶段 5  接口层          ⬜ 未开始  web/server.py
阶段 6  前端            ⬜ 未开始  web/static/
阶段 7  接真模型        ⬜ 未开始  OpenAICompatClient / OllamaClient 的 complete
阶段 8  打磨            ⬜ 未开始  README + 截图 + GIF
```

### 当前建议

**先做阶段 4 流水线，跳过阶段 3。**
理由：流水线核心是「文本 → 调 AI → 存库」，纯文本即可验证，不需要先会抓网页。
好处：先串出**端到端闭环**（存储层 + Mock AI），形成基准，之后再往里加抓取。

---

## 5. 已完成模块定稿

### 5.1 `app/store.py`

**结构**：`Store(db_path, dbtb_name)` 类，构造时建表。

**数据库列名（数据库风格，注意与文档的差异）**：

```
id, title, summary, content, url, model, provider,
category, tag, create_time, update_time,
status, error, source, keywords
```

> ⚠️ 用的是 `tag`（非 `tags`）、`create_time`/`update_time`（非 `created_at`/`updated_at`）。
> 接口层返回给前端时需要考虑是否需要映射成文档的名字。

**方法清单**：

| 方法 | 返回 | 要点 |
|---|---|---|
| `add(...)` | id | `last_insert_rowid()` 取 id |
| `get(id)` | **dict 或 None** | `row_factory` 设 connection 上、execute 之前；`dict(row)` 后再改字段 |
| `list(q, category, tag, limit)` | **list[dict]** | 动态拼 WHERE + `WHERE 1=1`；`q` 搜 title/summary/content 三列；`tag` 用 `%"{tag}"%` |
| `set_status(id, status, error=None)` | None | 两个分支都显式 SET error（含 None），避免旧错误残留 |
| `save_content(id, content, title)` | None | |
| `apply_analysis(id, analysis, provider, model)` | None | 同时写 `status='done'`、`error=None`、`update_time` |
| `delete(id)` | bool | 用 `total_changes == 0` 判断是否真删到 |
| `categories()` | `[{"name","count"}]` | GROUP BY + `COUNT(*)`，降序 |
| `tags()` | `[{"name","count"}]` | SQL 取全部 tag，**Python 里统计**，`json.loads` 容错，降序 |
| `stats()` | `{total,done,failed,categories,tags}` | `categories`/`tags` 用 `len()`，不是 `sum()` |

**已知隐患（不影响当前阶段）**：

- `db_path` 相对路径依赖 cwd
- 异常全部 `print` 后继续，调用方不知道失败
- `update_time` 只在 `apply_analysis` 里更新
- 列名 `TIMESTAMP` + `CURRENT_TIMESTAMP` 格式与 Python ISO 格式不统一
- 表名用 f-string 拼接（当前是常量，安全）

### 5.2 `app/llm/client.py`

**文件内顺序**：`import` → `decode_to_json` → `LLMClient` → `MockClient` → `OpenAICompatClient` → `OllamaClient` → `build_client`

**`decode_to_json(message)`**

```
1. json.loads 直接试
2. 失败 → 配对计数抠最外层 {}
   （遇 { 计数+1，遇 } 计数-1，归零截断；end 有值后不再计数）
3. 全失败 → raise ValueError("模型输出中没有 JSON")
```

> **关键原则：失败必须抛异常，绝不返回空值。** 已通过四种用例测试：
> 标准 / 代码围栏 / 噪音+嵌套 / 完全无 JSON。

**`LLMClient(ABC)`**

```python
@abstractmethod
def complete(self, system, user, temperature=None) -> str: ...

def json(self, system, user, temperature=None) -> dict:
    return decode_to_json(self.complete(system, user, temperature))
```

> `complete` 抽象（各家不同）；`json` 非抽象（逻辑相同，子类继承）。

**`MockClient`**（`name='mock'`, `model='mock-rules-v1'`）

- `re.split(r'[。.]', user)` 切句 → title 取第一段
- summary 取前三段拼接
- `re.split(r'[.。、，,]', user)` + 按空格二次切分 → tags（过滤 `len<2 or len>10`）
- 含 `python`/`代码`/`框架` → 技术/编程
- `json.dumps(..., ensure_ascii=False)` 返回字符串

> ⚠️ **未处理 prompt 前缀**（`正文：` / `标题（仅供参考）：`），真实流水线调用时会污染 title。

**`OpenAICompatClient` / `OllamaClient`**

- 目前是 `pass` 空壳，**`complete` 未实现**
- ⚠️ `__init__` 是 `pass` → 缺 key 不会报错（见挂起问题）

**`build_client(CONFIG)`**

```python
provider = CONFIG.LLM_PROVIDER
if provider == 'mock':   return MockClient()
elif provider == 'openai':  return OpenAICompatClient(config=CONFIG)
elif provider == 'ollama':  return OllamaClient(config=CONFIG)
else: raise ValueError('不存在该配置的模型')
```

> 待改进：provider 应 `.lower()` 统一大小写。

### 5.3 `app/config.py`

**`Config` 类**：`load_dotenv()` + `os.getenv`。

| 配置项 | 默认值 | 类型 |
|---|---|---|
| `LLM_PROVIDER` | `mock` | str |
| `LLM_BASE_URL` | `https://api.deepseek.com/v1` | str |
| `LLM_API_KEY` | `''` | str |
| `LLM_MODEL` | 跟随 provider | str |
| `LLM_TIMEOUT` | 120 | **float**（`float(os.getenv(...))`） |
| `LLM_TEMPERATURE` | 0.2 | **float** |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | str |
| `OLLAMA_MODEL` | `qwen2.5:7b` | str |

**核心规则：provider 决定 model 和 base_url**

| provider | model | base_url |
|---|---|---|
| `mock` | `mock-rules-v1` | `''` |
| `ollama` | `OLLAMA_MODEL` | `OLLAMA_URL` |
| 其他 | `LLM_MODEL` 或 `deepseek-chat` | `LLM_BASE_URL` |

**`get_config()`**：返回 `provider/model/timeout/temperature/base_url/has_key` 等。
**`has_key` 是布尔值，绝不返回 key 原文。**

---

## 6. 踩过的坑

### 6.1 五个结构性教训（复盘重点）

**① 测试 ≠ 没崩**

多次出现「测试过了」，实际只验证了「没报错」，没验证「结果对」。
**正确做法**：检查类型和结构。
```python
print(type(x))                     # 是不是 dict / list
print(isinstance(x['tags'], list)) # tags 是不是列表
```

**② 同一个错误反复出现 = 不理解，只在模仿**

`dict(row)` 出现三次（每次换个地方埋）。一个错误重复出现时，不要继续试，回去问「这个函数到底要求什么输入」。

**③ 改 A 弄坏 B**

修 `tags()` 返回结构时把 `sorted` 删了。**每次改完要重跑验证清单**，不能只看「这次改的那行对不对」。

**④ 失败伪装成成功 —— 最反复犯的模式**

- `delete()` 永远返回 True（删 0 行不抛异常）
- `list()` 的 `except` 吞掉错误返回 `[]`
- `set_status()` 清不掉旧 error
- `build_client` 写 `return ValueError(...)` 而非 `raise`
- `decode_to_json` 失败返回空字符串

**⑤ 写完必须立刻跑**

`dict(row)` 卡了四轮，根本原因是每次改完不跑，接着改别的。

### 6.2 具体坑位表

| # | 坑 | 现象 | 解决 |
|---|---|---|---|
| 1 | 游标没 `fetchall` | 返回 `<sqlite3.Cursor object>` | 加 `fetchall()`，且必须在 `close()` 之前 |
| 2 | `row_factory` 设在 cursor 上 | `AttributeError`（Cursor 无此属性） | 设在 **connection** 上，**execute 之前** |
| 3 | `sqlite3.Row` 只读 | `row["tag"] = ...` 抛 TypeError | 先 `dict(row)` 再改字段 |
| 4 | `except KeyError` 捕 JSON 错 | 该抛的崩了 | 用 `json.JSONDecodeError` |
| 5 | 裸 `except:` | 吞掉 Ctrl+C / SystemExit | 指定异常类型 |
| 6 | `str.split` 传多个分隔符 | 只按第一个参数切 | 用 `re.split(r'[。.、，,]', s)` |
| 7 | 取「最后一个」`{}` | 嵌套 JSON 外层丢失 | 配对计数，归零即截断 |
| 8 | `os.getenv` 返回字符串 | timeout 有时 str 有时 int | 统一 `float(...)`，默认值也写字符串 |
| 9 | `.env` 与 provider 不一致 | provider=mock 却显示 deepseek-chat | **provider 决定 model/base_url** |
| 10 | `== None` 判断 | `.env` 空值返回 `''`，漏判 | 用 `not x` |
| 11 | 相对导入点数错 | `ModuleNotFoundError` | `app/web/` 引用 `app/` 用 `from ..config`（两个点） |
| 12 | 直接跑含相对导入的文件 | `attempted relative import with no known parent package` | 用 `python -m app.llm.client` |
| 13 | `start = None` 后切片 | `TypeError` | 重写为无状态逻辑（`re.split`） |
| 14 | 中文无空格 | 按空格切词 → tags 为空 | 按标点切后再二次切分 |
| 15 | `x < 2 and x > 10` | 永假，过滤失效 | 用 `or` |
| 16 | 变量名遮蔽内置函数 | `list = ...` 后无法调 `list()` | 改名 `cur` |
| 17 | trafilatura 丢正文 | 中文站点只抽到导语 | `<p>` + 常见容器兜底，取较长者 |
| 18 | 显存误判 | 以为只有 4GB | 用 `nvidia-smi` 查 |

---

## 7. 关键决策

| 决策 | 结论 | 理由 |
|---|---|---|
| 数据库 | **SQLite**，不上 MySQL | 单人单机、零部署；`pyproject.toml` 里的 `pymysql` 应删除 |
| ID 删除后是否重排 | **不重排不复用** | id 是唯一标识不是排队号；重排会让引用指错、制造并发错误 |
| `get()` 返回什么 | **dict 或 None**（暂不引入 `Item` 类） | `Item` 是阶段 5 的事；dict 满足当前需求，以后加 `Item(**dict)` 一行转换即可 |
| `list()` 查不到返回什么 | **`[]`** | 前端遍历 `None` 会崩；`get` 用 `None`、`list` 用 `[]` 是语义区别 |
| 密钥存放 | **`.env`**，绝不入数据库、不入 git | 密钥是配置不是数据；`has_key` 是现算结果，哪都不存 |
| `provider`/`model` 能否入库 | **可以** | 是历史事实（记录当时用了什么），非秘密，可用于对比模型效果 |
| Mock 的质量标准 | **不崩 + 结构对**，不追求抽得准 | 上了真模型这套规则全废；价值在于让测试不联网 |
| 抽象在哪里用 | **只在 LLM 层**，`Store` 不做抽象 | 只有 LLM 明确要三种实现；Store 只用 SQLite，过度设计没必要 |
| 失败处理 | **尽早抛异常**，不让错误带病传播 | 错误伪装成返回值会崩在很远的地方，且报错与真实原因无关 |
| 同步 vs 异步 | 第一版**同步** | 简单；上量后再改后台任务 + 轮询 |

---

## 8. 待办清单

### 阶段 2 收尾

- [ ] 确认「缺 key 抛异常」的检查真的写进了 `OpenAICompatClient.__init__`（可能是假测试，见挂起问题）
- [ ] （可选）`build_client` 里 provider 改 `.lower()`
- [ ] （可选）Mock 剥掉 prompt 前缀（`正文：` / `标题（仅供参考）：`）

### 阶段 3：抓取与抽取 `app/fetcher.py`

- [ ] `is_url(text)`：解析 URL 判断 scheme，不用 `startswith`
- [ ] `fetch_html(url)`：UA、Accept-Language、**5MB 体积上限**（流式读）、编码降级
- [ ] `html_to_text(html)`：取 `<title>` → trafilatura → 降级 bs4
- [ ] **`<p>` 兜底**：剥 script/style/nav/footer 后收集 `<p>`，再按常见容器选择器兜底，**取较长者**
- [ ] `clean_content(text, limit)`：压缩空白 + 截断（2 万字符）

### 阶段 4：流水线 `app/pipeline/`

- [ ] `ingest(store, source, title=None, client=None)` 编排
- [ ] **先入库（pending）再处理**
- [ ] 状态流转：pending → fetching → analyzing → done / failed
- [ ] **异常全部兜住**，返回 RunResult，不向上抛
- [ ] 字段兜底清洗（tags 可能是字符串、category 为空、title 过长）
- [ ] 离线冒烟脚本 `scripts/smoke_test.py`

### 阶段 5：接口层 `app/web/server.py`（按文档第 7 章契约）

- [ ] `POST /api/items`（201 成功；400 输入空；**422 分析失败但返回条目**）
- [ ] `GET /api/items`（q/category/tag/limit）
- [ ] `GET /api/items/{id}`、`POST .../reanalyze`、`DELETE .../{id}`
- [ ] `GET /api/config`（**脱敏**）、`/api/stats`、`/api/categories`、`/api/tags`
- [ ] 相对导入 `from ..config`

### 阶段 6：前端 `app/web/static/`

- [ ] 顶部（**显著标出 mock**）、左侧统计+分类+标签、右侧输入+搜索+列表、详情弹层
- [ ] **所有内容转义防 XSS**
- [ ] 搜索防抖 250ms、提交 loading、失败条目视觉区分、Esc 关闭
- [ ] 收到 422 时**同时刷新列表**

### 阶段 7：接真模型

- [ ] `OpenAICompatClient.complete`（7 步：拼地址→拼头→拼体→发→**先查状态码**→取 `choices[0].message.content`→返回）
- [ ] `OllamaClient.complete`（差异：`/api/chat`、无认证、`options.temperature`、`message.content`）
- [ ] `__init__` 里缺 key 就 raise

### 阶段 8：打磨

- [ ] README（架构图、截图、30 秒 GIF、快速开始、设计决策）
- [ ] 检查 `.gitignore` 覆盖 `.env` 和 `data/*.db`

---

## 9. 挂起问题

### ⚠️ 测试 2 是真是假（最优先确认）

作者报告「三条工厂分支测试都通过」，但 `OpenAICompatClient.__init__` 里是 `pass`，缺 key 时**不会报错**，会返回空对象。测试通过可能只验证了「抛了任何异常」或者根本没测到。

**确认方法**：
```python
import os
os.environ['LLM_PROVIDER'] = 'openai'
os.environ['LLM_API_KEY'] = ''
try:
    client = build_client(Config())
    print("没报错 →", type(client).__name__)   # 说明检查没做
except Exception as e:
    print("报错了 →", e)                       # 说明检查做了
```

### 其他

- `pyproject.toml` 里的 `pymysql` / `cryptography` 应删除（与 SQLite 方案冲突）
- `git status` 里的未跟踪文件 `数据库格式`（字段笔记，编码可能有 GBK 乱码）需决定去留
- `.env` 与 `.env.example` 应在 mock 模式下注释掉只对 openai 有效的项

---

## 10. 协作约定

### 给 AI 助手的指令

1. **不要替作者实现代码**。作者要从零自己写，目标是学习 + 作品集。
2. **指出问题即可，不要直接改文件**，除非明确要求。
3. 讲概念时**跳出项目、用独立例子**（如支付类、USB 接口类比）。
4. 每次指出的问题要**分级**：会崩的 / 逻辑错的 / 隐患。
5. **强调验证方式**——作者最常犯的错是「没跑就说测试过了」。
6. 作者不知道下一步做什么时，**给出最小可执行的一步**，不要一次给完整方案。

### 给作者的自查清单

写完任何存储层函数，跑这七项：

```
□ 空数据会怎样？
□ 查/删不存在的 id 会怎样？
□ 参数为空（q="" / tag="" / limit=None）会怎样？
□ 返回结构对照文档，字段名和类型一致吗？
□ 存进去再读出来，类型一样吗（特别是列表字段）？
□ 这一步失败了，调用方知道吗？有没有 except 吞掉？
□ 该变的字段变了吗（如分析成功 status 变 done）？
```

### 运行方式

```powershell
cd D:\Accepted\Project\AgentForNotes
.\.venv\Scripts\Activate.ps1
python -m app.llm.client          # 用 -m 方式跑，相对导入才生效
python -m uvicorn app.web.server:app --port 8000
```

### 安全红线

- `.env` **必须**在 `.gitignore` 里，定期 `git check-ignore -v .env` 验证
- `/api/config` **绝不能**返回 key 原文
- SQL **一律**参数化，绝不拼接
- 前端**一律**转义后再插入 DOM

---

## 附录：文档参考章节对照

| 想了解 | 看开发文档 |
|---|---|
| 功能需求 | 第 3 章 |
| 数据模型（表结构设计） | 第 6 章 |
| 接口契约（最该对照的） | 第 7 章 |
| 模块设计细节 | 第 8 章 |
| AI 层（提示词、解析） | 第 9 章 |
| 分阶段计划 | 第 11 章 |
| 测试与验收标准 | 第 12 章 |
| 风险坑位 | 第 13 章 |
| RAG 等演进 | 第 14 章 |
