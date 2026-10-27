import sys,subprocess,os
from PIL import Image
def sheet(mp4,out,n=8):
    d=float(subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",mp4],capture_output=True,text=True).stdout)
    fr=[]
    for i in range(n):
        t=0.3+(d-0.8)*i/(n-1); p=f"/tmp/fr{i}.png"
        subprocess.run(["ffmpeg","-v","error","-y","-ss",f"{t:.2f}","-i",mp4,"-frames:v","1","-vf","scale=-2:360",p]); fr.append(Image.open(p))
    w,h=fr[0].size; cols=4; rows=(n+cols-1)//cols; s=Image.new("RGB",(w*cols,h*rows))
    for i,f in enumerate(fr): s.paste(f,((i%cols)*w,(i//cols)*h))
    s.save(out)
if __name__=="__main__": sheet(sys.argv[1],sys.argv[2])
