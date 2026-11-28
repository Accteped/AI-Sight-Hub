/* ============================================================
   AI Insight Hub — 前端逻辑
   原生 JS，零依赖，零构建。
   安全约定：任何来自接口的字符串一律用 textContent 写入 DOM，
   全文不使用 innerHTML，从根上杜绝 XSS。
   ============================================================ */

(function () {
  "use strict";

  /* ── 常量 ─────────────────────────────────────────── */

  var SEARCH_DEBOUNCE = 250;      // 文档 §8.7：搜索防抖 250ms
  var STATUS_TEXT = {
    pending: "排队中",
    fetching: "抓取中",
    analyzing: "分析中",
    done: "已完成",
    failed: "失败"
  };

  // 资料彩色调色板：每条资料按 id 哈希稳定取色。
  // 同一 id 永远同一个颜色，不同资料颜色各异。
  var PALETTE = [
    "#60a5fa", "#a78bfa", "#f472b6", "#fb7185", "#fb923c",
    "#fbbf24", "#4ade80", "#2dd4bf", "#22d3ee", "#818cf8"
  ];

  function itemColor(id) {
    var n = Number(id);
    if (!isFinite(n) || n < 0) { n = 0; }
    // 乘一个大质数再取模，让相邻 id 落到不同色相
    return PALETTE[(n * 7 + 3) % PALETTE.length];
  }

  function hexToRgba(hex, alpha) {
    var h = hex.replace("#", "");
    var r = parseInt(h.substring(0, 2), 16);
    var g = parseInt(h.substring(2, 4), 16);
    var b = parseInt(h.substring(4, 6), 16);
    return "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
  }

  /* ── DOM ──────────────────────────────────────────── */

  var $ = function (id) { return document.getElementById(id); };

  var el = {
    stats: $("stats"),
    categories: $("categories"),
    tags: $("tags"),
    modelDot: $("model-dot"),
    modelName: $("model-name"),
    modelProvider: $("model-provider"),
    pageTitle: $("page-title"),
    pageMeta: $("page-meta"),
    compose: $("compose"),
    composeForm: $("compose-form"),
    composeInput: $("compose-input"),
    composeError: $("compose-error"),
    submitCompose: $("submit-compose"),
    search: $("search"),
    activeFilters: $("active-filters"),
    list: $("list"),
    empty: $("empty"),
    emptyTitle: $("empty-title"),
    emptyText: $("empty-text"),
    modal: $("modal"),
    modalPanel: $("modal-panel"),
    modalNo: $("modal-no"),
    modalBody: $("modal-body"),
    toast: $("toast")
  };

  /* ── 状态 ─────────────────────────────────────────── */

  var state = {
    q: "",
    category: "",
    tag: "",
    status: "done",          // done | failed | all，默认只看已完成
    items: [],               // 后端返回的全部条目
    categories: [],
    tags: [],
    config: null,
    busy: false,
    lastFocus: null
  };

  /* ── 小工具 ───────────────────────────────────────── */

  function pad4(n) {
    var s = String(n == null ? 0 : n);
    while (s.length < 4) { s = "0" + s; }
    return s;
  }

  function recordNo(id) { return "#" + pad4(id); }

  // 阅读页地址：新标签页打开，渲染 Markdown + LaTeX
  function articleUrl(id) {
    return "/static/article.html?id=" + encodeURIComponent(id);
  }

  // 标签清洗：mock 模式会把原文切片当标签，需过滤代码/公式残片
  var NOISE_TAG = /[\\${}#|`^*_\[\]<>()=;,]/;

  function cleanTag(t) {
    var s = String(t == null ? "" : t).replace(/\s+/g, " ").trim();
    if (!s) { return ""; }
    if (NOISE_TAG.test(s)) { return ""; }
    if (s.length < 2 || s.length > 24) { return ""; }
    if (!/[\u4e00-\u9fa5]|[A-Za-z]{2,}/.test(s)) { return ""; }
    return s;
  }

  function cleanTags(raw) {
    var out = [];
    if (!Array.isArray(raw)) { return out; }
    raw.forEach(function (t) {
      var c = cleanTag(t);
      if (c && out.indexOf(c) < 0) { out.push(c); }
    });
    return out;
  }

  // 后端时间形如 "2026-11-27 03:23:50"（SQLite CURRENT_TIMESTAMP，UTC）
  function formatTime(value) {
    if (!value) { return "–"; }
    var iso = String(value).replace(" ", "T");
    if (iso.indexOf("Z") < 0 && iso.indexOf("+") < 0) { iso += "Z"; }
    var d = new Date(iso);
    if (isNaN(d.getTime())) { return String(value); }
    var mm = String(d.getMonth() + 1);
    var dd = String(d.getDate());
    var hh = String(d.getHours());
    var mi = String(d.getMinutes());
    if (mm.length < 2) { mm = "0" + mm; }
    if (dd.length < 2) { dd = "0" + dd; }
    if (hh.length < 2) { hh = "0" + hh; }
    if (mi.length < 2) { mi = "0" + mi; }
    return d.getFullYear() + "-" + mm + "-" + dd + " " + hh + ":" + mi;
  }

  // 把换行/连续空白压成单个空格：网页抓来的标题常带 \n，会破坏单行布局
  function oneLine(s) {
    return String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  }

  // 摘要清洗：原文是 Markdown 时，模型生成的摘要会带语法符号
  function stripInlineMarkdown(s) {
    return String(s == null ? "" : s)
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/\$\$[\s\S]*?\$\$/g, " ")
      .replace(/`[^`]*`/g, " ")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function truncate(text, max) {
    var s = String(text == null ? "" : text);
    if (s.length <= max) { return s; }
    return s.slice(0, max) + "…";
  }

  // 文档 §7.3：错误统一从 detail 取；本项目后端用的是 error，两个都兼容
  function errorText(body, fallback) {
    if (body && typeof body === "object") {
      if (typeof body.detail === "string" && body.detail) { return body.detail; }
      if (typeof body.error === "string" && body.error) { return body.error; }
    }
    if (typeof body === "string" && body.trim()) { return body.trim(); }
    return fallback || "请求失败";
  }

  /* ── 提示条 ───────────────────────────────────────── */

  var toastTimer = null;

  function toast(message, kind) {
    if (!el.toast) { return; }
    el.toast.textContent = message;
    el.toast.dataset.kind = kind === "error" ? "error" : "info";
    el.toast.hidden = false;
    // 先显示再切 data-show，保证 transition 生效
    void el.toast.offsetWidth;
    el.toast.dataset.show = "true";
    if (toastTimer) { clearTimeout(toastTimer); }
    toastTimer = setTimeout(function () {
      el.toast.dataset.show = "false";
      toastTimer = setTimeout(function () {
        el.toast.hidden = true;
        toastTimer = null;
      }, 220);
    }, kind === "error" ? 4200 : 2600);
  }

  /* ── 网络 ─────────────────────────────────────────── */

  function request(url, options) {
    return fetch(url, options).then(function (res) {
      // 204：无响应体，不能调 json()
      if (res.status === 204) {
        return { ok: res.ok, status: res.status, body: null };
      }
      return res.text().then(function (text) {
        var body = null;
        if (text) {
          try { body = JSON.parse(text); } catch (e) { body = text; }
        }
        return { ok: res.ok, status: res.status, body: body };
      });
    });
  }

  /* ── 渲染：统计 ───────────────────────────────────── */

  function renderStats(data) {
    var fields = ["total", "done", "failed", "categories", "tags"];
    fields.forEach(function (key) {
      // 主统计区与隐藏的 dl 里同名 data-stat 节点一起写
      var nodes = document.querySelectorAll('[data-stat="' + key + '"]');
      if (!nodes.length) { return; }

      var value = data && typeof data[key] === "number" ? data[key] : 0;

      // 标签数用清洗后的口径，避免显示 187 但侧栏只列出几十个的割裂感
      if (key === "tags" && state.tags.length) {
        value = state.tags.filter(function (row) {
          return row && row.name && cleanTag(row.name);
        }).length;
      }

      for (var i = 0; i < nodes.length; i++) {
        nodes[i].textContent = String(value);
        nodes[i].dataset.zero = value === 0 ? "true" : "false";
      }
    });
  }

  /* ── 渲染：分面（分类 / 标签） ─────────────────────── */

  function renderFacets(listNode, rows, activeValue, onPick) {
    listNode.textContent = "";

    var all = document.createElement("li");
    var allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.className = "facet";
    allBtn.setAttribute("aria-pressed", activeValue === "" ? "true" : "false");

    var allName = document.createElement("span");
    allName.className = "facet-name";
    allName.textContent = "全部";
    allBtn.appendChild(allName);

    allBtn.addEventListener("click", function () { onPick(""); });
    all.appendChild(allBtn);
    listNode.appendChild(all);

    (rows || []).forEach(function (row) {
      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "facet";
      btn.setAttribute("aria-pressed", row.name === activeValue ? "true" : "false");
      btn.title = row.name;

      var name = document.createElement("span");
      name.className = "facet-name";
      name.textContent = row.name;

      var count = document.createElement("span");
      count.className = "facet-count";
      count.textContent = String(row.count);

      btn.appendChild(name);
      btn.appendChild(count);
      btn.addEventListener("click", function () { onPick(row.name); });

      li.appendChild(btn);
      listNode.appendChild(li);
    });
  }

  function renderCategories() {
    renderFacets(el.categories, state.categories, state.category, function (value) {
      state.category = value === state.category ? "" : value;
      loadItems();
    });
  }

  function renderTags() {
    // 标签云只展示通过清洗的词，避免大量碎片标签（mock 模式常见）
    var cleaned = [];
    state.tags.forEach(function (row) {
      if (!row || !row.name) { return; }
      if (!cleanTag(row.name)) { return; }
      cleaned.push(row);
    });
    renderFacets(el.tags, cleaned, state.tag, function (value) {
      state.tag = value === state.tag ? "" : value;
      loadItems();
    });
  }

  /* ── 渲染：当前筛选项提示 ─────────────────────────── */

  function renderActiveFilters() {
    el.activeFilters.textContent = "";

    var chips = [];
    if (state.category) { chips.push({ kind: "category", label: "分类：" + state.category }); }
    if (state.tag) { chips.push({ kind: "tag", label: "标签：" + state.tag }); }

    chips.forEach(function (chip) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";

      var text = document.createElement("span");
      text.textContent = chip.label;

      var icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("class", "ico");
      icon.setAttribute("aria-hidden", "true");
      var use = document.createElementNS("http://www.w3.org/2000/svg", "use");
      use.setAttribute("href", "#i-close");
      icon.appendChild(use);

      btn.appendChild(text);
      btn.appendChild(icon);
      btn.addEventListener("click", function () {
        if (chip.kind === "category") { state.category = ""; }
        if (chip.kind === "tag") { state.tag = ""; }
        loadItems();
      });

      el.activeFilters.appendChild(btn);
    });
  }

  /* ── 渲染：标题与计数 ─────────────────────────────── */

  // 按当前状态筛选，返回可见条目
  function visibleItems() {
    if (state.status === "all") { return state.items; }
    return state.items.filter(function (item) {
      return (item.status || "") === state.status;
    });
  }

  function renderHead() {
    var title = "全部资料";
    if (state.category && state.tag) {
      title = state.category + " · " + state.tag;
    } else if (state.category) {
      title = state.category;
    } else if (state.tag) {
      title = "标签 · " + state.tag;
    }
    el.pageTitle.textContent = title;

    var shown = visibleItems().length;
    var total = state.items.length;
    var parts = [];

    if (state.status === "done") {
      parts.push("已完成 " + shown + " 条");
      if (total > shown) { parts.push("另有 " + (total - shown) + " 条未显示"); }
    } else if (state.status === "failed") {
      parts.push("失败 " + shown + " 条");
    } else {
      parts.push("共 " + total + " 条");
    }
    if (state.q) { parts.push("搜索「" + state.q + "」"); }

    el.pageMeta.textContent = parts.join(" · ");
  }

  /* ── 渲染：列表 ───────────────────────────────────── */

  function buildCard(item, index) {
    var li = document.createElement("li");

    // 用 <a> 而不是 <button>：支持右键"在新标签页打开"和中键点击
    var btn = document.createElement("a");
    btn.className = "card";
    btn.href = articleUrl(item.id);
    btn.target = "_blank";
    btn.rel = "noopener";
    btn.dataset.status = item.status || "pending";
    var color = itemColor(item.id);
    btn.style.setProperty("--cat", color);
    btn.style.setProperty("--cat-soft", hexToRgba(color, 0.14));
    btn.style.setProperty("--cat-line", hexToRgba(color, 0.34));
    btn.style.animationDelay = Math.min(index, 6) * 40 + "ms";

    // 顶部：标题 + 档案编号
    var top = document.createElement("div");
    top.className = "card-top";

    var title = document.createElement("h3");
    title.className = "card-title";
    var titleText = oneLine(item.title);
    if (titleText) {
      title.textContent = titleText;
      title.title = titleText;
    } else {
      title.textContent = "（未生成标题）";
      title.classList.add("card-title--muted");
    }

    var no = document.createElement("span");
    no.className = "record-no";
    no.textContent = recordNo(item.id);

    top.appendChild(title);
    top.appendChild(no);
    btn.appendChild(top);

    var isFailed = item.status === "failed";

    // 摘要：失败条目不再用错误文本顶替摘要，避免一屏全是英文报错
    if (isFailed) {
      var errLine = document.createElement("p");
      errLine.className = "card-summary card-summary--error";
      errLine.textContent = item.error
        ? truncate(String(item.error).replace(/\s+/g, " "), 110)
        : "分析失败，没有记录原因";
      btn.appendChild(errLine);
    } else {
      var summary = document.createElement("p");
      summary.className = "card-summary";
      var summaryText = item.summary && item.summary.trim()
        ? stripInlineMarkdown(item.summary)
        : (item.content
            ? truncate(stripInlineMarkdown(item.content), 120)
            : "暂无摘要");
      summary.textContent = oneLine(summaryText);
      btn.appendChild(summary);
    }

    // 底部：分类 + 标签 + 状态
    var foot = document.createElement("div");
    foot.className = "card-foot";

    var tagsWrap = document.createElement("div");
    tagsWrap.className = "card-tags";

    if (item.category) {
      var cat = document.createElement("span");
      cat.className = "tag tag--cat";
      cat.textContent = item.category;
      tagsWrap.appendChild(cat);
    }

    var allTags = cleanTags(item.tags);
    var tags = allTags.slice(0, 4);
    tags.forEach(function (t) {
      var tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = t;
      tagsWrap.appendChild(tag);
    });

    if (tags.length < allTags.length) {
      var more = document.createElement("span");
      more.className = "tag";
      more.textContent = "+" + (allTags.length - tags.length);
      tagsWrap.appendChild(more);
    }

    foot.appendChild(tagsWrap);

    var spacer = document.createElement("span");
    spacer.className = "card-spacer";
    foot.appendChild(spacer);

    var st = document.createElement("span");
    st.className = "status";
    st.dataset.status = item.status || "pending";
    var dot = document.createElement("span");
    dot.className = "status-dot";
    st.appendChild(dot);
    st.appendChild(document.createTextNode(STATUS_TEXT[item.status] || item.status || "未知"));
    foot.appendChild(st);

    btn.appendChild(foot);

    // 新标签页打开是 <a target=_blank> 的原生行为，无需额外监听
    li.appendChild(btn);

    // 快速操作：删除 / 重新分析（放在卡片外层，避免 <a> 内嵌 <button> 的非法结构）
    var quick = document.createElement("button");
    quick.type = "button";
    quick.className = "card-quick";
    quick.setAttribute("aria-label", "更多操作");
    quick.title = "删除 / 重新分析";
    quick.textContent = "⋯";
    quick.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      openDetail(item.id);
    });
    li.appendChild(quick);

    return li;
  }

  function renderList() {
    el.list.textContent = "";

    if (!state.items.length) {
      el.empty.hidden = false;
      el.emptyTitle.textContent = state.q || state.category || state.tag
        ? "没有匹配的资料"
        : "还没有资料";
      el.emptyText.textContent = state.q || state.category || state.tag
        ? "换个关键词，或清除筛选条件再试"
        : "贴一个网址或一段文本，系统会抓取正文并生成摘要、标签和分类";
      return;
    }

    var items = visibleItems();

    if (!items.length) {
      el.empty.hidden = false;
      var hasFailed = state.items.some(function (it) { return it.status === "failed"; });
      if (state.status === "failed") {
        el.emptyTitle.textContent = "没有失败的条目";
        el.emptyText.textContent = "所有资料都分析成功了";
      } else if (state.status === "done" && hasFailed) {
        el.emptyTitle.textContent = "没有已完成的条目";
        el.emptyText.textContent = "切到「失败」看看哪些需要重新分析";
      } else {
        el.emptyTitle.textContent = "没有匹配的资料";
        el.emptyText.textContent = "换个关键词，或清除筛选条件再试";
      }
      return;
    }

    el.empty.hidden = true;

    var frag = document.createDocumentFragment();
    items.forEach(function (item, i) {
      frag.appendChild(buildCard(item, i));
    });
    el.list.appendChild(frag);
  }

  /* ── 渲染：整页 ───────────────────────────────────── */

  function renderAll() {
    renderHead();
    renderActiveFilters();
    renderList();
  }

  /* ── 数据加载 ─────────────────────────────────────── */

  function loadItems() {
    var params = new URLSearchParams();
    if (state.q) { params.set("q", state.q); }
    if (state.category) { params.set("category", state.category); }
    if (state.tag) { params.set("tag", state.tag); }
    params.set("limit", "200");

    return request("/api/items?" + params.toString())
      .then(function (res) {
        if (!res.ok) {
          throw new Error(errorText(res.body, "加载列表失败"));
        }
        state.items = Array.isArray(res.body) ? res.body : [];
        renderAll();
      })
      .catch(function (err) {
        toast(err.message || "加载列表失败", "error");
      });
  }

  function loadFacets() {
    // allSettled：统计 / 分类 / 标签 三路互不拖累，任一失败不影响其余渲染
    return Promise.allSettled([
      request("/api/stats"),
      request("/api/categories"),
      request("/api/tags?limit=60")
    ]).then(function (results) {
      var settled = function (i) {
        return results[i] && results[i].status === "fulfilled" ? results[i].value : null;
      };

      var cats = settled(1);
      if (cats && cats.ok) {
        state.categories = Array.isArray(cats.body) ? cats.body : [];
      }
      renderCategories();

      var tags = settled(2);
      if (tags && tags.ok) {
        state.tags = Array.isArray(tags.body) ? tags.body : [];
      } else {
        // 后端 limit 无默认值时可能 422，降级为不显示标签，不影响主流程
        state.tags = [];
      }
      renderTags();

      // 放在渲染标签之后：标签数要用清洗后的口径
      var stats = settled(0);
      if (stats && stats.ok) { renderStats(stats.body); }

      if (!stats || !stats.ok) {
        toast("统计信息加载失败", "error");
      }
    });
  }

  function loadConfig() {
    return request("/api/config").then(function (res) {
      if (!res.ok) { return; }
      var llm = (res.body && res.body.llm) || {};
      state.config = llm;

      el.modelName.textContent = llm.model || "未知模型";

      var isMock = llm.provider === "mock";
      var noKey = llm.has_key === false;

      // 状态点：真实模型=绿、mock=黄、缺 Key=红
      el.modelDot.dataset.live = (!isMock && !noKey) ? "true" : "false";
      el.modelDot.dataset.warn = (isMock || noKey) ? "true" : "false";

      if (isMock) {
        el.modelProvider.textContent = "规则模拟";
        el.modelProvider.dataset.mock = "true";
      } else if (noKey) {
        el.modelProvider.textContent = "未配置 Key";
        el.modelProvider.dataset.mock = "true";
      } else {
        el.modelProvider.textContent = "真实模型";
        el.modelProvider.dataset.mock = "false";
      }
      el.modelName.title = "provider: " + (llm.provider || "?");
    }).catch(function () {
      el.modelName.textContent = "配置读取失败";
    });
  }

  function refreshAll() {
    return Promise.all([loadItems(), loadFacets()]);
  }

  /* ── 录入 ─────────────────────────────────────────── */

  function clearCompose() {
    el.composeInput.value = "";
    el.composeInput.style.height = "";
    el.composeError.hidden = true;
    el.composeError.textContent = "";
  }

  function setComposeBusy(busy) {
    state.busy = busy;
    el.submitCompose.disabled = busy;
    el.submitCompose.textContent = busy ? "分析中…" : "开始分析";
  }

  function submitCompose() {
    var raw = el.composeInput.value.trim();

    el.composeError.hidden = true;
    el.composeError.textContent = "";

    if (!raw) {
      el.composeError.textContent = "请先输入网址或文本";
      el.composeError.hidden = false;
      el.composeInput.focus();
      return;
    }
    if (state.busy) { return; }

    // 文档：url 和 text 二选一，由后端判断是不是链接，这里按形态分流
    var isUrl = /^https?:\/\/\S+$/i.test(raw);
    var payload = isUrl ? { url: raw } : { text: raw };

    setComposeBusy(true);

    request("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (res.status === 201) {
        toast("已入库并完成分析");
        clearCompose();
        return refreshAll();
      }
      if (res.status === 422) {
        // 已入库但分析失败 —— 必须刷新列表，让用户看到失败条目（文档 §7.2）
        toast("已入库，但分析失败：" + errorText(res.body, "未知原因"), "error");
        clearCompose();
        return refreshAll();
      }
      if (res.status === 400) {
        el.composeError.textContent = errorText(res.body, "输入不合法");
        el.composeError.hidden = false;
        return null;
      }
      throw new Error(errorText(res.body, "提交失败（HTTP " + res.status + "）"));
    }).catch(function (err) {
      el.composeError.textContent = err.message || "提交失败";
      el.composeError.hidden = false;
    }).then(function () {
      setComposeBusy(false);
    });
  }

  /* ── 详情弹层 ─────────────────────────────────────── */

  function metaCell(key, value, isLink) {
    var cell = document.createElement("div");
    cell.className = "meta-cell";

    var k = document.createElement("span");
    k.className = "meta-key";
    k.textContent = key;

    var v = document.createElement("span");
    v.className = "meta-val";

    if (isLink && value) {
      var a = document.createElement("a");
      a.href = value;
      a.textContent = value;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      v.appendChild(a);
    } else {
      v.textContent = value || "–";
    }

    cell.appendChild(k);
    cell.appendChild(v);
    return cell;
  }

  function sectionLabel(text) {
    var h = document.createElement("h4");
    h.className = "section-label";
    h.textContent = text;
    return h;
  }

  function buildDetail(item) {
    // 统一清理：正文区与操作区都由本函数独占重建，
    // 调用方不需要（也不应该）自己 remove，避免中途抛异常留下半空弹层
    el.modalBody.textContent = "";
    var staleActions = el.modalPanel.querySelector(".modal-actions");
    if (staleActions) { staleActions.remove(); }

    el.modalNo.textContent = recordNo(item.id);

    // 标题 + 摘要
    var head = document.createElement("div");
    var title = document.createElement("h3");
    title.className = "detail-title";
    title.id = "modal-title";
    title.textContent = item.title && item.title.trim() ? item.title : "（未生成标题）";
    head.appendChild(title);

    if (item.summary && item.summary.trim()) {
      var summary = document.createElement("p");
      summary.className = "detail-summary";
      summary.textContent = stripInlineMarkdown(item.summary);
      head.appendChild(summary);
    }
    el.modalBody.appendChild(head);

    // 失败原因
    if (item.status === "failed" && item.error) {
      var err = document.createElement("p");
      err.className = "detail-error";
      err.textContent = "分析失败：" + item.error;
      el.modalBody.appendChild(err);
    }

    // 元信息
    var metaSection = document.createElement("div");
    metaSection.className = "detail-section";
    metaSection.appendChild(sectionLabel("元信息"));

    var grid = document.createElement("div");
    grid.className = "meta-grid";
    grid.appendChild(metaCell("状态", STATUS_TEXT[item.status] || item.status || "未知"));
    grid.appendChild(metaCell("分类", item.category));
    grid.appendChild(metaCell("模型", item.model));
    grid.appendChild(metaCell("创建", formatTime(item.create_at)));
    grid.appendChild(metaCell("更新", formatTime(item.update_at)));
    if (item.url) {
      grid.appendChild(metaCell("来源链接", item.url, true));
    }
    metaSection.appendChild(grid);
    el.modalBody.appendChild(metaSection);

    // 标签
    var tags = Array.isArray(item.tags) ? item.tags.filter(Boolean) : [];
    var keywords = Array.isArray(item.keywords) ? item.keywords.filter(Boolean) : [];

    if (tags.length) {
      var tagSection = document.createElement("div");
      tagSection.className = "detail-section";
      tagSection.appendChild(sectionLabel("标签"));
      var tagWrap = document.createElement("div");
      tagWrap.className = "card-tags";
      tags.forEach(function (t) {
        var span = document.createElement("span");
        span.className = "tag";
        span.textContent = t;
        tagWrap.appendChild(span);
      });
      tagSection.appendChild(tagWrap);
      el.modalBody.appendChild(tagSection);
    }

    if (keywords.length) {
      var kwSection = document.createElement("div");
      kwSection.className = "detail-section";
      kwSection.appendChild(sectionLabel("关键词"));
      var kwWrap = document.createElement("div");
      kwWrap.className = "card-tags";
      keywords.forEach(function (k) {
        var span = document.createElement("span");
        span.className = "tag";
        span.textContent = k;
        kwWrap.appendChild(span);
      });
      kwSection.appendChild(kwWrap);
      el.modalBody.appendChild(kwSection);
    }

    // 正文
    var contentSection = document.createElement("div");
    contentSection.className = "detail-section";
    contentSection.appendChild(sectionLabel("正文"));
    var content = document.createElement("pre");
    content.className = "detail-content";
    content.textContent = item.content && item.content.trim() ? item.content : "（无正文）";
    contentSection.appendChild(content);
    el.modalBody.appendChild(contentSection);

    // 操作
    var actions = document.createElement("div");
    actions.className = "modal-actions";

    var del = document.createElement("button");
    del.type = "button";
    del.className = "btn btn--danger";
    del.textContent = "删除";
    del.addEventListener("click", function () { removeItem(item); });

    var spacer = document.createElement("span");
    spacer.className = "spacer";

    var re = document.createElement("button");
    re.type = "button";
    re.className = "btn";
    re.textContent = "重新分析";
    re.addEventListener("click", function () { reanalyze(item.id, re); });

    actions.appendChild(del);
    actions.appendChild(spacer);
    actions.appendChild(re);

    el.modalPanel.appendChild(actions);
  }

  function openDetail(id) {
    state.lastFocus = document.activeElement;

    request("/api/items/" + encodeURIComponent(id)).then(function (res) {
      if (!res.ok) {
        toast(errorText(res.body, "条目不存在"), "error");
        return;
      }
      buildDetail(res.body);
      el.modal.hidden = false;
      el.modalPanel.focus();
    }).catch(function () {
      toast("打开详情失败", "error");
    });
  }

  function closeModal() {
    el.modal.hidden = true;
    var oldActions = el.modalPanel.querySelector(".modal-actions");
    if (oldActions) { oldActions.remove(); }
    el.modalBody.textContent = "";

    // 还原焦点：原节点可能已被删除/重绘，只有仍在文档里才聚焦，
    // 否则回落到搜索框，避免焦点丢到 body 上
    var target = state.lastFocus;
    state.lastFocus = null;
    if (target && target.isConnected && typeof target.focus === "function") {
      target.focus();
    } else if (el.search) {
      el.search.focus();
    }
  }

  /* ── 删除 ─────────────────────────────────────────── */

  function removeItem(item) {
    var label = item.title && item.title.trim() ? item.title : recordNo(item.id);
    if (!window.confirm("删除「" + truncate(label, 40) + "」？此操作不可撤销。")) {
      return;
    }

    request("/api/items/" + encodeURIComponent(item.id), { method: "DELETE" })
      .then(function (res) {
        if (res.status === 204 || res.ok) {
          toast("已删除");
          closeModal();
          return refreshAll();
        }
        if (res.status === 404) {
          toast("条目已不存在", "error");
          closeModal();
          return refreshAll();
        }
        throw new Error(errorText(res.body, "删除失败"));
      })
      .catch(function (err) {
        toast(err.message || "删除失败", "error");
      });
  }

  /* ── 重新分析 ─────────────────────────────────────── */

  function reanalyze(id, button) {
    button.disabled = true;
    var original = button.textContent;
    button.textContent = "分析中…";

    request("/api/items/" + encodeURIComponent(id) + "/reanalyze", { method: "POST" })
      .then(function (res) {
        if (res.status === 404) {
          toast("条目已不存在", "error");
          closeModal();
          return refreshAll();
        }
        if (res.status === 422) {
          toast("重新分析失败：" + errorText(res.body, "未知原因"), "error");
          return refreshAll().then(function () {
            closeModal();
          });
        }
        if (!res.ok) {
          throw new Error(errorText(res.body, "重新分析失败"));
        }
        toast("已重新分析");
        // 用返回的新数据重绘详情（buildDetail 自带清理），再刷新列表
        if (res.body && typeof res.body === "object") {
          buildDetail(res.body);
        }
        return refreshAll();
      })
      .catch(function (err) {
        toast(err.message || "重新分析失败", "error");
      })
      .then(function () {
        button.disabled = false;
        button.textContent = original;
      });
  }

  /* ── 事件绑定 ─────────────────────────────────────── */

  var searchTimer = null;

  el.search.addEventListener("input", function () {
    if (searchTimer) { clearTimeout(searchTimer); }
    searchTimer = setTimeout(function () {
      searchTimer = null;
      state.q = el.search.value.trim();
      loadItems();
    }, SEARCH_DEBOUNCE);
  });

  // 状态筛选：纯前端切换，不重新请求
  var statusFilter = $("status-filter");
  if (statusFilter) {
    statusFilter.addEventListener("click", function (event) {
      var btn = event.target.closest(".segment");
      if (!btn) { return; }
      var next = btn.dataset.status;
      if (!next || next === state.status) { return; }
      state.status = next;

      var segments = statusFilter.querySelectorAll(".segment");
      for (var i = 0; i < segments.length; i++) {
        segments[i].setAttribute(
          "aria-pressed",
          segments[i].dataset.status === next ? "true" : "false"
        );
      }
      renderAll();
    });
  }

  el.composeForm.addEventListener("submit", function (event) {
    event.preventDefault();
    submitCompose();
  });

  // 输入框随内容自动长高，空时保持单行
  function autoGrow() {
    var node = el.composeInput;
    node.style.height = "auto";
    node.style.height = Math.min(node.scrollHeight, 200) + "px";
  }

  el.composeInput.addEventListener("input", autoGrow);

  el.composeInput.addEventListener("keydown", function (event) {
    // 没有修饰键时回车即提交（单行输入的习惯），Shift+Enter 换行
    if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      submitCompose();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      submitCompose();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      clearCompose();
      el.composeInput.blur();
    }
  });

  // 点遮罩或关闭按钮关弹层
  el.modal.addEventListener("click", function (event) {
    if (event.target.closest("[data-close]")) { closeModal(); }
  });

  // Esc 关弹层；弹层内 Tab 限制在面板内
  document.addEventListener("keydown", function (event) {
    if (el.modal.hidden) { return; }
    if (event.key === "Escape") {
      event.preventDefault();
      closeModal();
      return;
    }
    if (event.key !== "Tab") { return; }

    var focusables = el.modalPanel.querySelectorAll(
      'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusables.length) { return; }

    var first = focusables[0];
    var last = focusables[focusables.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  /* ── 启动 ─────────────────────────────────────────── */

  loadConfig();
  refreshAll();

})();
