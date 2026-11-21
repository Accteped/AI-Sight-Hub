import json
from abc import ABC, abstractmethod

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

class LLMClient(ABC):
    @abstractmethod
    def complete(self, system, user, temperature = None) -> str:
        pass

    def json(self, system, user, temperature = None) -> dict:
        raw = self.complete(system, user, temperature)
        json_code = decode_to_json(raw)
        return json_code

class MockClient(LLMClient):
    name = 'mock'
    model = 'mock-rules-v1'

    def complete(self, system, user, temperature=None) -> str:
        #title匹配
        title = ''
        summary = user
        tags = []
        category = "其他"
        count_end = 0
        start = 0
        count_split = 1
        for index in range(len(user)):
            if user[index] == '。':
                
                count_split = count_split + 1
                count_end = count_end + 1
                if count_end == 1:
                    title = user[:(index)]
                if count_end == 3:
                    summary = user[:(index+1)]
                if count_split == 1:
                    start = index + 1
            if user[index] == ' ':
                count_split = count_split + 1
                if count_split == 1:
                    start = index + 1
            if count_split == 2:
                count_split = 0
                if len(user[start:index]) < 2 or len(user[start:index]) > 10:
                    start = None
                    continue
                tags.append(user[start:index])
                start = None
        if 'python' in user or '代码' in user or '框架' in user:
            category = "技术/编程"
        return json.dumps({
        "title": title,
        "summary": summary,
        "tags": tags,
        "category": category
        }, ensure_ascii=False)

t = MockClient()
print(t.json("系统",'FastAPI 是一个现代 Python Web 框架。它基于类型提示构建。适合快速开发 AI 应用。'))