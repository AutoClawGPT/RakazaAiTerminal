import os,hashlib,subprocess,json,urllib.request
from script import VIDEOS,SLOP
KEY=os.environ["DEEPGRAM_API_KEY"]
def tts(text):
    h=hashlib.md5(text.encode()).hexdigest()[:12]; p=f"/workspace/vid/tts/{h}.mp3"
    if os.path.exists(p): return p
    req=urllib.request.Request("https://api.deepgram.com/v1/speak?model=aura-2-luna-en&encoding=mp3",data=json.dumps({"text":text}).encode(),headers={"Authorization":"Token "+KEY,"Content-Type":"application/json"})
    with urllib.request.urlopen(req,timeout=60) as r: open(p,"wb").write(r.read())
    return p
if __name__=="__main__":
    n=0
    for c in VIDEOS+SLOP:
        for b in c["beats"]: tts(b["say"]); n+=1
    print("tts ok",n)
