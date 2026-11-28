import json
#收到的内容不一定为'[]'，对于'abc','[abc]',(...),None都要处理
def clean_recv(text):
    if text is None:
        return []
    #处理字符串
    if isinstance(text, str):
        #先看解析之后是[]还是abc
        try:
            values = json.loads(text)
        except (json.JSONDecodeError,TypeError):
            #不是json，直接传成["abc"]
            return [text] if text.strip() else []
        #处理解析结果不是list而是('123' --> 123)
        if isinstance(values, list):
            #把里面空的字符串去掉
            return [str(temp) for temp in values if str(temp).strip()]
        return [str(values)] if str(values).strip() else []
    #对于直接传的是[]或者()的就可以直接处理
    if isinstance(text, (list, tuple)):
        return [str(value) for value in text if str(value).strip()]
    #兜底
    return []
        
class Analysis:
    def __init__(self, title='', summary='', category='其他', tags=None, keywords=None):
        self.title = title
        self.summary = summary
        self.category = category
        self.tags = clean_recv(tags)
        self.keywords = clean_recv(keywords)
