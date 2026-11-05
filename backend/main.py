from fastapi import FastAPI

app = FastAPI(title="VoiceStock API")


@app.get("/")
def read_root():
    return {"message": "VoiceStock API is running"}
