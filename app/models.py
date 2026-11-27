
class Analysis:
    def __init__(self, title='', summary='', category='其他', tags='[]', keywords='[]'):
        self.title = title
        self.summary = summary
        self.category = category
        self.tags = tags if tags is not None else []
        self.keywords = keywords if keywords is not None else []
