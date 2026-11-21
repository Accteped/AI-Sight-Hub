import os
from dotenv import load_dotenv
load_dotenv()

class Config:
    def __init__(self):
        self.LLM_PROVIDER = os.getenv('LLM_PROVIDER','mock')
        self.LLM_BASE_URL = os.getenv('LLM_BASE_URL','https://api.deepseek.com/v1')
        self.LLM_API_KEY = os.getenv('LLM_API_KEY','')
        self.LLM_MODEL = os.getenv('LLM_MODEL', None)
        self.LLM_TIMEOUT = float(os.getenv('LLM_TIMEOUT', 120))
        self.LLM_TEMPERATURE = float(os.getenv('LLM_TEMPERATURE', 0.2))
        self.OLLAMA_URL = os.getenv('OLLAMA_URL','http://127.0.0.1:11434')
        self.OLLAMA_MODEL = os.getenv('OLLAMA_MODEL','qwen2.5:7b')
        if self.LLM_MODEL == None:
            if self.LLM_PROVIDER == 'mock':
                self.LLM_MODEL = 'mock-rules-v1'
            elif self.LLM_PROVIDER == 'ollama':
                self.LLM_MODEL = self.OLLAMA_MODEL
            else:
                self.LLM_MODEL = 'deepseek-chat'
        if self.LLM_PROVIDER == 'ollama':
            self.LLM_BASE_URL = self.OLLAMA_URL
        elif self.LLM_PROVIDER == 'mock':
            self.LLM_BASE_URL = ''
    def get_config(self):
        json_config = {"llm":{"provider":self.LLM_PROVIDER,
                    "model":self.LLM_MODEL,
                    "timeout":self.LLM_TIMEOUT,
                    "base_url":self.LLM_BASE_URL,
                    "temperature":self.LLM_TEMPERATURE,
                    'has_key':bool(self.LLM_API_KEY)}
        }
        return json_config
