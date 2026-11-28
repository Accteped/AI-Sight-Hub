import json
import re
from abc import ABC, abstractmethod
import httpx

def decode_to_json(message):
    msg = ''
    try:
        msg = json.loads(message)
        return msg
    except json.JSONDecodeError:
        if('{' in message and '}' in message):
            begin = end = None
            count_in = 0
            for i in range(len(message)):
                if message[i] == '{' and end is None:
                    count_in = count_in + 1
                    if begin is None:
                        begin = i
                if message[i] == '}' and count_in:
                    count_in = count_in - 1
                    if count_in == 0:
                        end = i + 1
            if end is None or begin is None:
                raise ValueError("模型输出中没有 JSON")
            message_to_standard = message[begin:end]
            try:
                msg = json.loads(message_to_standard)
                return msg
            except json.JSONDecodeError:
                raise ValueError("模型输出中没有 JSON")
        else:
            raise ValueError("模型输出中没有 JSON")
#抽象类，json表示把系统和用户提示词合并
class LLMClient(ABC):
    @abstractmethod
    def complete(self, system, user, temperature = None) -> str:
        pass

    def json(self, system, user, temperature = None) -> dict:
        raw = self.complete(system, user, temperature)
        json_code = decode_to_json(raw)
        return json_code
#本地备用处理方案
class MockClient(LLMClient):
    name = 'mock'
    model = 'mock-rules-v1'

    def complete(self, system, user, temperature=None) -> str:
        #title,summary,tags,category初始化
        split_dot = re.split(r'[。.]', user)
        title = split_dot[0]
        tags = []
        if len(split_dot) < 3:
            summary = user
        else:
            summary = split_dot[0] + '。' + split_dot[1] + '。' + split_dot[2]
        split_all = re.split(r'[.。]', user)
        for words in split_all:
            split_word = words.split(' ')
            for word in split_word:
                if len(word) < 3 or len(word) > 10:
                    continue
                tags.append(word)
        category = "其他"
        if 'python' in user or '代码' in user or '框架' in user:
            category = "技术/编程"
        return json.dumps({
        "title": title,
        "summary": summary,
        "tags": tags,
        "category": category,
        "keywords": []
        }, ensure_ascii=False)

class OpenAICompatClient(LLMClient):
    name = 'openai-compat'
    model = None

    def __init__(self, config):
        self.config = config
        self.model = config.LLM_MODEL

    def _extract_error(self, respond):
        """从错误响应里提取可读信息。

        优先取 {"error": {"message": ...}}；失败则退回原始文本。
        无论哪条路径都要剔除 api key 片段，避免写进数据库再显示到前端。
        """
        detail = ''
        try:
            body = respond.json()
        except Exception:
            body = None

        if isinstance(body, dict):
            err = body.get('error')
            if isinstance(err, dict):
                detail = str(err.get('message') or err.get('code') or '')
            elif err:
                detail = str(err)
            if not detail:
                detail = str(body.get('message') or '')

        if not detail:
            detail = respond.text[:200]

        # 服务端会回显 key 的后几位，如 "Your api key: ****460d is invalid"
        detail = re.sub(r'\*{2,}\S*', '****', detail)
        return detail.strip()[:200]

    def complete(self, system, user, temperature=None):
        if not self.config.LLM_API_KEY:
            raise ValueError("请先配置 LLM_API_KEY（在 .env 中填写）")

        if temperature is None:
            temperature = self.config.LLM_TEMPERATURE

        url = self.config.LLM_BASE_URL.rstrip('/') + '/chat/completions'

        try:
            respond = httpx.post(
                url,
                headers={'Authorization': f'Bearer {self.config.LLM_API_KEY}'},
                json={'model': self.model,
                      'messages': [
                          {'role': 'system', 'content': system},
                          {'role': 'user', 'content': user}],
                      'temperature': temperature},
                timeout=self.config.LLM_TIMEOUT)
        # 子类必须写在父类前面，否则永远不会被捕获
        except httpx.TimeoutException:
            raise RuntimeError(
                f'模型响应超时（{self.config.LLM_TIMEOUT:g} 秒），文本可能过长或网络较慢')
        except httpx.ConnectError:
            raise RuntimeError(
                f'无法连接模型服务，请检查 LLM_BASE_URL：{self.config.LLM_BASE_URL}')
        except httpx.HTTPError as e:
            raise RuntimeError(f'网络请求失败：{e}')

        if respond.status_code >= 400:
            raise RuntimeError(
                f'调用模型失败({respond.status_code})：{self._extract_error(respond)}')

        try:
            data = respond.json()
        except Exception:
            raise ValueError(f'模型响应不是合法 JSON，状态码 {respond.status_code}')

        if not isinstance(data, dict):
            raise ValueError(f'模型响应结构异常，期望对象，实际 {type(data).__name__}')

        choices = data.get('choices')
        if not isinstance(choices, list) or not choices:
            raise ValueError('模型响应中没有 choices，可能是内容被安全策略拦截')

        message = choices[0].get('message') if isinstance(choices[0], dict) else None
        if not isinstance(message, dict):
            raise ValueError('模型响应中 choices[0].message 结构异常')

        # 达到长度上限时 JSON 必然被截断，提前给出准确提示
        if choices[0].get('finish_reason') == 'length':
            raise ValueError('模型输出被截断（达到 max_tokens），请缩短输入文本')

        content = message.get('content')
        if not isinstance(content, str) or not content.strip():
            raise ValueError('模型返回内容为空')

        return content

#本地模型类
class OllamaClient(LLMClient):
    def __init__(self, config):
        pass
    def complete(self, system, user, temperature=None):
        pass

def build_client(CONFIG):
    provider = CONFIG.LLM_PROVIDER
    if provider == 'mock':
        return MockClient()
    elif provider == 'openai':
        return OpenAICompatClient(config=CONFIG)
    elif provider == 'ollama':
        return OllamaClient(config=CONFIG)
    else:
        raise ValueError('不存在该配置的模型')
