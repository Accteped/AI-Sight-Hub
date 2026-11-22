import trafilatura
from bs4 import BeautifulSoup
from urllib.parse import urlparse
import httpx
import re
#判断是不是http/https链接
def is_url(text):
    try:
        url = urlparse(text)
    except:
        return False
    #判断是不是http/https链接,还要判断后面非空，避免http:a的情况
    if (url.scheme == 'https' or url.scheme == 'http') and url.netloc:
        return True
    else:
        return False
    #ParseResult(scheme='https', netloc='www.example.com', path='/', params='', query='keyword=abc&id=12', fragment='')
#获取并解析html源码
def fetch_html(url):
    chunks = []
    total = 0
    decode = "utf-8"
    header = {"User-Agent":'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36 Edg/158.0.0.0','Accept-Language':'zh-CN,zh;q=0.9,en;q=0.8'}
    try:
        #以流式传输
        with httpx.Client() as client:
            with client.stream('GET', url=url, headers=header, timeout=100, follow_redirects=True) as r:
                if r.status_code >= 400:
                    raise Exception(f"状态码--{r.status_code}:{url}")
                else:
                    #将文本分块处理，防止超出大小限制
                    for list_ in r.iter_bytes():
                        total = total + len(list_)
                        #大小超过5MB
                        if total > 5 * 1024 * 1024:
                            raise Exception("需要下载的网页内容超过5MB")
                        chunks.append(list_)
                    decode = r.encoding
    except httpx.HTTPError as e:
        raise Exception(f"抓取失败:{e}")
    #将分块列表合成为一串Byte
    raw = b"".join(chunks)
    try:
        return raw.decode(decode or "utf-8", errors = 'replace')
    except LookupError as e:
        return raw.decode("utf-8", errors = 'replace')
#把获取的html源码解析成标题和正文
def html_to_text(html):
    article = ""
    title = ""
    #第一种获取正文的方法
    article_t = ""
    try:
        article_t = trafilatura.extract(html)
    except Exception:
        article_t = ""
    #第二种获取正文的方法
    article_b = ""
    phrase = []
    soup = BeautifulSoup(html, "html.parser")
    for delete in soup(["script","style","nav","footer","header"]):
        delete.decompose()
    for p in soup.find_all("p"):
        text = p.get_text(" ",strip=True)
        if len(text) >= 15:
            phrase.append(text)
    article_b = "\n".join(phrase)
    #比较两种方式获得的长度，用于兜底第一种方法获取长度过短
    if len(article_b) > len(article_t):
        article = article_b
    else:
        article = article_t
    #获取标题
    if soup.title and soup.title.string:
        title = soup.title.string.strip()
    else:
        title = ""

    return (title, article)
#组合is_url,fetch_html,html_to_text几个功能的函数
def fetch_article(url):
    if not is_url(url):
        raise Exception("提供的url既不是HTTP也不是HTTPS链接")
    html = fetch_html(url)
    return html_to_text(html)

def clean_content(text, limit=20000):
    #按行分割
    text_ = text.splitlines()
    line = []
    #逐行去除首尾空格，并去掉空行
    for ln in text_:
        if ln.strip():
            line.append(ln.strip())
    #去掉空行的合成字符串
    lines = "\n".join(line)
    #截断超出长度限制的部分
    if(len(lines) > limit):
        lines_limit = lines[:limit] + "...[剩下内容已经截断]"
        return lines_limit
    return lines