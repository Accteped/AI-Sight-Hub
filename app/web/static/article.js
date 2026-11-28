/* ============================================================
   阅读页逻辑 —— 新标签页展示单篇文章（Markdown + LaTeX）
   ============================================================ */

(function () {
  "use strict";

  var STATUS_TEXT = {
    pending: "排队中",
    fetching: "抓取中",
    analyzing: "分析中",
    done: "已完成",
    failed: "失败"
  };

  var $ = function (id) { return document.getElementById(id); };

  var el = {
    backLink: $("back-link"),
    no: $("reader-no"),
    status: $("reader-status"),
    title: $("reader-title"),
    summary: $("reader-summary"),
    meta: $("reader-meta"),
    tags: $("reader-tags"),
    content: $("content"),
    footModel: $("foot-model"),
    toggleRaw: $("toggle-raw"),
    toast: $("toast")
  };

  var rawContent = "";
  var showingRaw = false;

  /* ── 工具 ─────────────────────────────────────────── */

  function pad4(n) {
    var s = String(n == null ? 0 : n);
    while (s.length < 4) { s = "0" + s; }
    return s;
  }

  function formatTime(value) {
    if (!value) { return ""; }
    var iso = String(value).replace(" ", "T");
    if (iso.indexOf("Z") < 0 && iso.indexOf("+") < 0) { iso += "Z"; }
    var d = new Date(iso);
    if (isNaN(d.getTime())) { return String(value); }
    var p = function (n) { return String(n).length < 2 ? "0" + n : String(n); };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
      " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  var toastTimer = null;

  function toast(message) {
    el.toast.textContent = message;
    el.toast.hidden = false;
    void el.toast.offsetWidth;
    el.toast.dataset.show = "true";
    if (toastTimer) { clearTimeout(toastTimer); }
    toastTimer = setTimeout(function () {
      el.toast.dataset.show = "false";
      setTimeout(function () { el.toast.hidden = true; }, 220);
    }, 3000);
  }

  function showEmpty(title, text) {
    el.title.textContent = title;
    el.summary.hidden = true;
    el.content.textContent = "";
    var box = document.createElement("div");
    box.className = "reader-empty";
    var t = document.createElement("p");
    t.className = "reader-empty-title";
    t.textContent = title;
    var d = document.createElement("p");
    d.className = "reader-empty-text";
    d.textContent = text;
    box.appendChild(t);
    box.appendChild(d);
    el.content.appendChild(box);
  }

  /* ── Markdown 渲染 + XSS 防护 ─────────────────────── */

  // 原文可能来自任意网页，里面完全可能带 <script>、onerror=、javascript: 等。
  // marked 默认不会清洗，所以这里渲染后必须剥离危险内容。
  var BANNED_TAGS = [
    "script", "style", "iframe", "object", "embed", "form",
    "input", "button", "textarea", "select", "option",
    "link", "meta", "base", "frame", "frameset", "applet"
  ];

  function sanitize(container) {
    // 1. 移除危险标签
    BANNED_TAGS.forEach(function (tag) {
      var nodes = container.querySelectorAll(tag);
      for (var i = 0; i < nodes.length; i++) {
        nodes[i].remove();
      }
    });

    // 2. 过滤所有属性：只留白名单，且去掉 javascript:/data: 协议
    var all = container.querySelectorAll("*");
    for (var i = 0; i < all.length; i++) {
      var node = all[i];
      var attrs = Array.prototype.slice.call(node.attributes);
      for (var j = 0; j < attrs.length; j++) {
        var name = attrs[j].name.toLowerCase();
        var value = attrs[j].value;

        // 事件处理属性一律删除
        if (name.indexOf("on") === 0) {
          node.removeAttribute(attrs[j].name);
          continue;
        }

        if (name === "href" || name === "src" || name === "xlink:href") {
          var v = String(value).trim().toLowerCase();
          if (v.indexOf("javascript:") === 0 ||
              v.indexOf("data:") === 0 ||
              v.indexOf("vbscript:") === 0) {
            node.removeAttribute(attrs[j].name);
          }
          continue;
        }

        // 其余属性只允许无害集合
        var allowed = ["href", "src", "alt", "title", "class", "id", "colspan", "rowspan", "align"];
        if (allowed.indexOf(name) < 0 && name.indexOf("aria-") !== 0) {
          node.removeAttribute(attrs[j].name);
        }
      }
    }
  }

  // 粗略判断内容是否含 Markdown 结构。
  // 纯文本（如网页正文抽取结果）如果按 Markdown 渲染，
  // 原有的换行和缩进会被吃掉，代码块会变成普通段落。
  function looksLikeMarkdown(text) {
    if (!text) { return false; }
    // 只需要命中少量明确信号即可，宁少勿多
    var signals = [
      /^#{1,6}\s+\S/m,          // 标题
      /```/,                     // 代码围栏
      /^\s*[-*+]\s+\S/m,         // 无序列表
      /^\s*\d+\.\s+\S/m,         // 有序列表
      /^\s*>\s+\S/m,             // 引用
      /\*\*[^*\n]+\*\*/,         // 粗体
      /\[[^\]\n]+\]\([^)\n]+\)/, // 链接
      /^\|.*\|.*$/m              // 表格
    ];
    var hits = 0;
    for (var i = 0; i < signals.length; i++) {
      if (signals[i].test(text)) { hits++; }
    }
    return hits >= 2;
  }

  function renderMarkdown(text) {
    if (typeof marked === "undefined" || !looksLikeMarkdown(text)) {
      // 库缺失或内容本身不是 Markdown：按纯文本保留换行与缩进，
      // 公式仍然单独排版
      el.content.classList.add("is-plain");
      el.content.textContent = text;
      renderMath();
      return;
    }

    el.content.classList.remove("is-plain");

    el.content.classList.remove("is-raw");

    // 关键：先把块级公式 $$...$$ 抽出来占位。
    // marked 会把公式内部的换行转成 <br>，KaTeX 就认不出定界符了。
    var blocks = [];
    var protectedText = text.replace(/\$\$([\s\S]+?)\$\$/g, function (_, body) {
      blocks.push(body);
      return "\n\nMATHBLOCK" + (blocks.length - 1) + "\n\n";
    });

    var html = marked.parse(protectedText, { breaks: true, gfm: true });

    // 先塞进游离容器，清洗后再插进页面——避免脚本在插入瞬间执行
    var holder = document.createElement("div");
    holder.innerHTML = html;
    sanitize(holder);

    // 把占位符还原成真正的 $$...$$ 文本，交给 KaTeX 排版
    var placeholders = holder.querySelectorAll("*");
    for (var i = 0; i < placeholders.length; i++) {
      var node = placeholders[i];
      if (node.children.length === 0 && /MATHBLOCK\d+/.test(node.textContent)) {
        node.textContent = node.textContent.replace(/MATHBLOCK(\d+)/g, function (_, idx) {
          return "$$" + blocks[Number(idx)] + "$$";
        });
      }
    }

    el.content.textContent = "";
    while (holder.firstChild) {
      el.content.appendChild(holder.firstChild);
    }

    // 链接统一新窗口打开
    var links = el.content.querySelectorAll("a[href]");
    for (var i = 0; i < links.length; i++) {
      links[i].setAttribute("target", "_blank");
      links[i].setAttribute("rel", "noopener noreferrer");
    }

    renderMath();
  }

  function renderMath() {
    if (typeof renderMathInElement !== "function") { return; }
    try {
      renderMathInElement(el.content, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "\\[", right: "\\]", display: true },
          { left: "\\(", right: "\\)", display: false },
          { left: "$", right: "$", display: false }
        ],
        throwOnError: false,
        ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code"]
      });
    } catch (e) {
      // 公式渲染失败不影响正文
      if (window.console) { console.warn("KaTeX render failed:", e); }
    }
  }

  /* ── 文本清洗 ─────────────────────────────────────── */

  // 摘要 / 标签来自模型对原文的加工，原文若是 Markdown，
  // 这些字段会被语法符号污染。这里去掉行内语法标记。
  function stripInlineMarkdown(s) {
    return String(s == null ? "" : s)
      .replace(/```[\s\S]*?```/g, " ")        // 代码块
      .replace(/\$\$[\s\S]*?\$\$/g, " ")      // 块级公式
      .replace(/`[^`]*`/g, " ")               // 行内代码
      .replace(/\*\*([^*]+)\*\*/g, "$1")      // 粗体
      .replace(/\*([^*]+)\*/g, "$1")          // 斜体
      .replace(/__([^_]+)__/g, "$1")
      .replace(/^#{1,6}\s+/gm, "")            // 标题标记
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // 链接 → 文字
      .replace(/^\s*[-*+]\s+/gm, "")          // 列表符号
      .replace(/\s+/g, " ")                   // 合并空白
      .trim();
  }

  // 标签：只保留干净短词。模型在 mock 模式下会把原文切片当标签，
  // 因此代码片段、公式残片、纯符号都要丢掉。
  var NOISE_TAG = /[\\${}#|`^*_\[\]<>()=;,]/;

  function cleanTag(t) {
    var s = String(t == null ? "" : t).replace(/\s+/g, " ").trim();
    if (!s) { return ""; }
    if (NOISE_TAG.test(s)) { return ""; }
    if (s.length < 2 || s.length > 24) { return ""; }
    // 至少要有一个中文字或连续字母，纯数字/纯符号不要
    if (!/[\u4e00-\u9fa5]|[A-Za-z]{2,}/.test(s)) { return ""; }
    return s;
  }

  /* ── 渲染页面 ─────────────────────────────────────── */

  function renderMeta(item) {
    el.meta.textContent = "";

    var pairs = [];
    if (item.category) { pairs.push({ text: item.category }); }
    if (item.model) { pairs.push({ text: item.model }); }
    if (item.create_at) { pairs.push({ text: formatTime(item.create_at) }); }
    if (item.url) { pairs.push({ text: item.url, href: item.url }); }

    pairs.forEach(function (p) {
      var s = document.createElement(p.href ? "a" : "span");
      if (p.href) {
        s.href = p.href;
        s.target = "_blank";
        s.rel = "noopener noreferrer";
      }
      s.textContent = p.text;
      if (p.href) { s.title = p.text; }
      el.meta.appendChild(s);
    });
  }

  function renderTags(item) {
    el.tags.textContent = "";
    var list = [];

    if (Array.isArray(item.tags)) {
      item.tags.forEach(function (t) {
        var c = cleanTag(t);
        if (c && list.indexOf(c) < 0) { list.push(c); }
      });
    }
    if (Array.isArray(item.keywords)) {
      item.keywords.forEach(function (k) {
        var c = cleanTag(k);
        if (c && list.indexOf(c) < 0) { list.push(c); }
      });
    }

    if (!list.length) {
      el.tags.hidden = true;
      return;
    }

    list.forEach(function (t) {
      var span = document.createElement("span");
      span.className = "tag";
      span.textContent = t;
      el.tags.appendChild(span);
    });
    el.tags.hidden = false;
  }

  function render(item) {
    document.title = (item.title && item.title.trim() ? item.title : "阅读") + " — AI Insight Hub";

    el.no.textContent = "#" + pad4(item.id);

    var statusText = STATUS_TEXT[item.status] || item.status || "未知";
    el.status.dataset.status = item.status || "";
    el.status.textContent = "";
    var dot = document.createElement("span");
    dot.className = "status-dot";
    el.status.appendChild(dot);
    el.status.appendChild(document.createTextNode(statusText));

    el.title.textContent = item.title && item.title.trim()
      ? stripInlineMarkdown(item.title)
      : "（未生成标题）";

    var cleanSummary = stripInlineMarkdown(item.summary || "");
    if (cleanSummary) {
      el.summary.textContent = cleanSummary;
      el.summary.hidden = false;
    } else {
      el.summary.hidden = true;
    }

    renderMeta(item);
    renderTags(item);

    rawContent = item.content || "";

    if (item.status === "failed" && item.error) {
      var errBox = document.createElement("p");
      errBox.className = "detail-error";
      errBox.textContent = "分析失败：" + item.error;
      el.content.textContent = "";
      el.content.appendChild(errBox);
      if (rawContent.trim()) {
        var pre = document.createElement("pre");
        pre.className = "detail-content";
        pre.textContent = rawContent;
        el.content.appendChild(pre);
      }
      el.toggleRaw.hidden = true;
      return;
    }

    if (!rawContent.trim()) {
      el.toggleRaw.hidden = true;
      showEmpty("没有正文", "这条记录还没有抓取到内容，可能是抓取失败或只保存了元信息。");
      return;
    }

    el.toggleRaw.hidden = false;
    renderMarkdown(rawContent);

    el.footModel.textContent = item.model ? "模型 " + item.model : "模型未知";
  }

  function loadConfig() {
    fetch("/api/config").then(function (r) { return r.json(); }).then(function (cfg) {
      var llm = (cfg && cfg.llm) || {};
      if (llm.provider === "mock") {
        el.footModel.textContent = "模型 " + (llm.model || "mock") + " · 规则模拟";
      } else if (llm.model) {
        el.footModel.textContent = "模型 " + llm.model;
      }
    }).catch(function () { /* 忽略 */ });
  }

  /* ── 原文切换 ─────────────────────────────────────── */

  el.toggleRaw.addEventListener("click", function () {
    showingRaw = !showingRaw;
    el.toggleRaw.textContent = showingRaw ? "渲染 Markdown" : "显示原文";

    if (showingRaw) {
      el.content.textContent = rawContent;
      el.content.classList.add("is-raw");
    } else {
      el.content.classList.remove("is-raw");
      renderMarkdown(rawContent);
    }
  });

  /* ── 启动 ─────────────────────────────────────────── */

  var params = new URLSearchParams(window.location.search);
  var id = params.get("id");

  loadConfig();

  if (!id || !/^\d+$/.test(id)) {
    showEmpty("缺少文章编号", "请从列表页点击条目进入，或检查地址栏的 id 参数。");
    el.toggleRaw.hidden = true;
    return;
  }

  fetch("/api/items/" + encodeURIComponent(id))
    .then(function (res) {
      if (res.status === 404) {
        showEmpty("文章不存在", "这条记录可能已被删除。");
        el.toggleRaw.hidden = true;
        return null;
      }
      if (!res.ok) { throw new Error("HTTP " + res.status); }
      return res.json();
    })
    .then(function (item) {
      if (item) { render(item); }
    })
    .catch(function (err) {
      showEmpty("加载失败", "无法读取文章内容，请稍后重试。");
      el.toggleRaw.hidden = true;
      toast("加载失败：" + err.message);
    });

})();
