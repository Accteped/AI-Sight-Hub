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
    def complete(self, system, user, temperature=None):
        if not self.config.LLM_API_KEY:
                    raise ValueError("请先配置API KEY")
        if temperature is None:
            temperature = self.config.LLM_TEMPERATURE
        url = self.config.LLM_BASE_URL.rstrip('/') + '/chat/completions'
        model = self.model
        respond = httpx.post(url,
                headers={'Authorization': f'Bearer {self.config.LLM_API_KEY}'},
                json={'model': model,
                    'messages': [
                        {'role': 'system', 'content': system},
                        {'role': 'user', 'content': user}],
                    'temperature': temperature},
                timeout=self.config.LLM_TIMEOUT)
        if respond.status_code >= 400:
            error = respond.text[:500]
            raise RuntimeError(f"调用模型失败({respond.status_code}) : {error}")
        text = respond.json()
        try:
            choices = text["choices"][0]["message"]
            content = choices.get("content", None)
        except Exception as e:
            content = None
        if not content:
            raise ValueError(f"模型返回内容为空或不存在需要内容{respond.json()}，状态码:{respond.status_code}")
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
