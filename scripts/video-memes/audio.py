import subprocess,numpy as np,hashlib,os
from tts import tts
SR=44100
def load(p,tempo):
    f=f"silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,areverse"
    if tempo!=1.0: f+=f",atempo={tempo}"
    f+=",loudnorm=I=-16:TP=-1.5:LRA=11"
    r=subprocess.run(["ffmpeg","-v","error","-i",p,"-af",f,"-ar",str(SR),"-ac","1","-f","s16le","-"],capture_output=True)
    return np.frombuffer(r.stdout,dtype=np.int16).astype(np.float32)/32768
def build_voice(clip,lead=0.15,tail=0.45):
    segs=[];t=lead;times=[]
    for b in clip["beats"]:
        a=load(tts(b["say"]),clip["tempo"]); d=len(a)/SR
        times.append((t,t+d)); segs.append((t,a)); t+=d+clip["gap"]
    total=t-clip["gap"]+tail
    out=np.zeros(int(total*SR)+1,np.float32)
    for s,a in segs: i=int(s*SR); out[i:i+len(a)]+=a
    return out,times,total
def music(total,bpm,slop,seed=1):
    rng=np.random.default_rng(seed); n=int(total*SR); m=np.zeros(n,np.float32)
    beat=60/bpm; t=np.arange(int(0.3*SR))/SR
    kick=np.sin(2*np.pi*(45*t+90*(1-np.exp(-t*30))/30*1))*np.exp(-t*9)
    hat=rng.standard_normal(int(0.05*SR)).astype(np.float32)*np.exp(-np.arange(int(0.05*SR))/SR*90)
    k=0.0
    while k<total:
        i=int(k*SR); m[i:i+len(kick)]+=kick[:max(0,min(len(kick),n-i))]*0.9 if i<n else 0
        h=int((k+beat/2)*SR)
        if h<n: m[h:h+len(hat)]+=hat[:max(0,min(len(hat),n-h))]*0.25
        k+=beat
    notes=[55,55,65.4,49] if not slop else [55,58.3,55,73.4]
    step=beat*(2 if not slop else 1); idx=0;k=0.0
    while k<total:
        f=notes[idx%4]; L=int(step*SR); L=min(L,n-int(k*SR))
        if L>0:
            tt=np.arange(L)/SR; w=np.sign(np.sin(2*np.pi*f*tt))*0.5+np.sin(2*np.pi*f*tt); env=np.minimum(1,tt*60)*np.exp(-tt*2.2)
            i=int(k*SR); m[i:i+L]+=w*env*0.22
        idx+=1;k+=step
    return np.tanh(m)*0.5
def mix(clip,out_wav):
    v,times,total=build_voice(clip)
    m=music(total,clip["bpm"],clip["kind"]=="slopcore")
    n=min(len(v),len(m)); v=v[:n]; m=m[:n]
    # duck music under voice
    env=np.convolve(np.abs(v),np.ones(2205)/2205,"same"); duck=1-0.65*np.clip(env*8,0,1)
    mix=v*0.95+m*0.32*duck
    mix=np.clip(mix,-1,1)
    import wave
    w=wave.open(out_wav,"wb");w.setnchannels(1);w.setsampwidth(2);w.setframerate(SR);w.writeframes((mix*32767).astype(np.int16).tobytes());w.close()
    return v,times,total
if __name__=="__main__":
    from script import VIDEOS,SLOP
    for c in VIDEOS+SLOP:
        v,t,tot=mix(c,f"/workspace/vid/{c['id']}.wav"); print(c["id"],round(tot,1),[round(b-a,1) for a,b in t])
