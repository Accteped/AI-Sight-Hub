from fastapi import FastAPI
app = FastAPI()

@app.get("/")
def home():
    return {"hello": "world"}

@app.get("/items")
def get(q : str):
    return {"hello": q}