import sys,os,math,subprocess,random,numpy as np
from PIL import Image,ImageDraw,ImageFont,ImageFilter
from script import VIDEOS,SLOP
from audio import mix,SR
G='/usr/share/fonts/truetype/sand-box/google/'
LG=G+'Luckiest Guy/LuckiestGuy-Regular.ttf'; AB=G+'Archivo Black/ArchivoBlack-Regular.ttf'
INK=(23,10,54);MUS=(255,200,61);PINK=(255,64,160);MINT=(52,224,170);LAV=(236,228,255);WHITE=(255,255,255)
COL={"mus":MUS,"pink":PINK,"mint":MINT}
RAW="/workspace/RakazaTokenization/app/.meme-raw/"; OUT="/workspace/RakazaTokenization/app/public/memes/"
FPS=25
ART={}
def art(n):
    if n not in ART: ART[n]=Image.open(RAW+n+".jpg").convert("RGB")
    return ART[n]
FONTS={}
def font(p,s):
    k=(p,s)
    if k not in FONTS: FONTS[k]=ImageFont.truetype(p,s)
    return FONTS[k]
def ease_out_back(x):
    x=min(max(x,0),1);c1=1.70158;c3=c1+1
    return 1+c3*(x-1)**3+c1*(x-1)**2
def cam(img,W,H,z,cx,cy,rot):
    s=max(W,H)/1024*z; th=math.radians(rot); c,sn=math.cos(th),math.sin(th)
    a=c/s;b=-sn/s;d=sn/s;e=c/s; ox,oy=W/2,H/2
    return img.transform((W,H),Image.AFFINE,(a,b,cx-(a*ox+b*oy),d,e,cy-(d*ox+e*oy)),resample=Image.BICUBIC,fillcolor=INK)
def pop_img(im,scale,rot=0):
    w,h=im.size; im=im.resize((max(1,int(w*scale)),max(1,int(h*scale))),Image.BICUBIC)
    return im.rotate(rot,expand=True,resample=Image.BICUBIC) if rot else im
def chunk_img(words,active,W,fs,slop):
    f=font(LG,fs); d0=ImageDraw.Draw(Image.new("RGBA",(1,1)))
    maxw=W*0.9; lines=[[]]; 
    for i,w in enumerate(words):
        cur=" ".join(x for x,_ in lines[-1]+[(w,i)])
        if lines[-1] and d0.textlength(cur,font=f)>maxw: lines.append([])
        lines[-1].append((w,i))
    lh=int(fs*1.12); sw=max(4,fs//9); pad=sw+int(fs*0.12)
    wmax=max(int(d0.textlength(" ".join(x for x,_ in l),font=f)) for l in lines)
    im=Image.new("RGBA",(wmax+2*pad+10,lh*len(lines)+2*pad),(0,0,0,0)); d=ImageDraw.Draw(im)
    for li,l in enumerate(lines):
        txt=" ".join(x for x,_ in l); x=(im.width-d0.textlength(txt,font=f))/2; y=pad+li*lh
        for w,i in l:
            col=MUS if i==active else WHITE
            d.text((x+fs//14,y+fs//12),w,font=f,fill=PINK,stroke_width=sw,stroke_fill=PINK)
            d.text((x,y),w,font=f,fill=col,stroke_width=sw,stroke_fill=INK)
            x+=d0.textlength(w+" ",font=f)
    return im
def sticker_img(text,col,fs):
    f=font(AB,fs); d0=ImageDraw.Draw(Image.new("RGBA",(1,1))); tw=d0.textlength(text,font=f); p=int(fs*0.35)
    im=Image.new("RGBA",(int(tw+2*p+14),int(fs*1.25+2*p*0.5+14)),(0,0,0,0)); d=ImageDraw.Draw(im)
    box=[0,0,im.width-14,im.height-14]; r=(box[3])//3
    d.rounded_rectangle([7+8,7+8,box[2]+7+8,box[3]+7+8],radius=r,fill=PINK)
    d.rounded_rectangle([7,7,box[2]+7,box[3]+7],radius=r,fill=COL.get(col,col),outline=INK,width=max(4,fs//10))
    d.text((7+box[2]/2,7+box[3]/2),text,font=f,fill=INK,anchor="mm")
    return im
def vignette(W,H):
    y,x=np.ogrid[:H,:W]; r=np.sqrt(((x-W/2)/(W/2))**2+((y-H/2)/(H/2))**2); return (1-np.clip((r-0.75)*0.55,0,0.5))[...,None].astype(np.float32)
def sparkle(d,x,y,s,col):
    d.polygon([(x,y-s),(x+s*0.25,y-s*0.25),(x+s,y),(x+s*0.25,y+s*0.25),(x,y+s),(x-s*0.25,y+s*0.25),(x-s,y),(x-s*0.25,y-s*0.25)],fill=col)
def env_of(v,n):
    sp=SR//FPS; e=np.array([np.sqrt(np.mean(v[i*sp:(i+1)*sp]**2)+1e-9) if len(v[i*sp:(i+1)*sp]) else 0.0 for i in range(n)]); e=e/(np.percentile(e,95)+1e-9); return np.clip(e,0,1.2)
def render(clip):
    W,H=(720,720) if clip["kind"]=="video" else (540,960); slop=clip["kind"]=="slopcore"
    wav=f"/workspace/vid/{clip['id']}.wav"; v,times,total=mix(clip,wav)
    n=int(total*FPS); env=env_of(v,n+2); rng=random.Random(clip["id"]); beatlen=60/clip["bpm"]
    vig=vignette(W,H); scan=np.ones((H,W,1),np.float32); scan[::3]=0.86
    # captions per beat
    beats=[]
    for bi,b in enumerate(clip["beats"]):
        bs,be=times[bi]; words=b["show"].split(); wt=[len(w)+(5 if w[-1] in ".?!" else 1) for w in words]; tot=sum(wt); acc=0; ws=[]
        for w,x in zip(words,wt): ws.append(bs+(be-bs)*acc/tot); acc+=x
        maxw=2 if slop else 3; chunks=[];cur=[]
        for i,w in enumerate(words):
            cur.append(i)
            if len(cur)>=maxw or w[-1] in ".?!" : chunks.append(cur);cur=[]
        if cur: chunks.append(cur)
        beats.append(dict(bs=bs,be=be,words=words,ws=ws,chunks=chunks,b=b,bi=bi))
    cache={}
    fs=(128 if slop else 84)
    def caption(bt,t):
        ci=max([k for k,c in enumerate(bt["chunks"]) if bt["ws"][c[0]]<=t] or [0]); c=bt["chunks"][ci]
        act=max([i for i in c if bt["ws"][i]<=t] or [c[0]])
        ws=[bt["words"][i] for i in c]; key=(bt["bi"],ci,act)
        if key not in cache:
            size=fs
            while True:
                im=chunk_img(ws,c.index(act),W,size,slop)
                if im.width<=W*0.96 or size<40: break
                size-=6
            cache[key]=im
        t0=bt["ws"][c[0]]; return cache[key],t-t0
    ssv={}
    for bt in beats:
        for k,(txt,x,y,rot,col) in enumerate(bt["b"].get("st",[])): ssv[(bt["bi"],k)]=sticker_img(txt,col,60 if not slop else 70).rotate(rot,expand=True,resample=Image.BICUBIC)
    phone={}
    def phone_frame(name,i):
        k=(name,i%len(os.listdir(f"/workspace/vid/frames/{name}")))
        if k not in phone: phone[k]=Image.open(f"/workspace/vid/frames/{name}/{k[1]+1:04d}.jpg").convert("RGB")
        return phone[k]
    sparks=[(rng.random()*W,rng.random()*H,rng.choice([10,14,18]),rng.random()*6.28) for _ in range(9)]
    brand=Image.new("RGBA",(W,H),(0,0,0,0)); bd=ImageDraw.Draw(brand)
    bd.rounded_rectangle([16,16,16+150,16+40],radius=20,fill=(23,10,54,225),outline=(236,228,255,255),width=3); bd.text((91,36),"RAKAZA",font=font(AB,22),fill=MUS,anchor="mm")
    foot="devnet only · not financial advice" if not slop else "rakaza-ai-terminal.vercel.app"
    bd.text((W/2,H-16),foot,font=font(AB,15),fill=(236,228,255,200),anchor="mm",stroke_width=2,stroke_fill=INK)
    posters={}; want={}
    if slop: want={int(times[i][0]*FPS+0.15*FPS):"s%d"%k for k,i in enumerate([1,3,5]) if i<len(times)}
    else: want={int((times[1][0]+0.35*(times[1][1]-times[1][0]))*FPS):"p"}
    outmp4=OUT+("slopcore/" if slop else "video/")+clip["id"]+".mp4"; os.makedirs(os.path.dirname(outmp4),exist_ok=True)
    tmp="/workspace/vid/"+clip["id"]+"-silent.mp4"
    for crf in ([34,37,40] if slop else [27,30,33]):
        pr=subprocess.Popen(["ffmpeg","-v","error","-y","-f","rawvideo","-pix_fmt","rgb24","-s",f"{W}x{H}","-r",str(FPS),"-i","-","-i",wav,"-t",f"{total:.2f}","-c:v","libx264","-preset","slow","-crf",str(crf),"-pix_fmt","yuv420p","-c:a","aac","-b:a","88k","-ac","1","-movflags","+faststart",outmp4],stdin=subprocess.PIPE)
        for i in range(n):
            t=i/FPS
            bt=next((b for b in reversed(beats) if b["bs"]-0.02<=t),beats[0]); lt=t-bt["bs"]; bd_=max(0.3,bt["be"]-bt["bs"]); p=min(1,max(0,lt/bd_))
            e=float(env[i]); ph=(t%beatlen)/beatlen; pulse=math.exp(-7*ph)
            if not slop:
                kind=bt["b"].get("cam","zoomin"); img=art(bt["b"]["img"])
                z={"zoomin":1.06+0.22*p,"zoomout":1.3-0.2*p,"panleft":1.2,"panright":1.2,"shake":1.14+0.05*math.sin(t*3)}[kind]
                cx=512+{"panleft":70-140*p,"panright":-70+140*p}.get(kind,6*math.sin(t*1.7)); cy=512+{"zoomin":-14*p}.get(kind,0)
                if bt["b"].get("screen"): cx+=80
                z*=1+0.035*e+0.018*pulse; rot=1.8*math.sin(t*2.1)+(1.6*math.sin(t*23)*pulse if kind=="shake" else 0)
                if kind=="shake": cx+=10*math.sin(t*31)*pulse
                fr=cam(img,W,H,z,cx,cy,rot)
            else:
                cut=0.36 if bt["bi"]%2==0 else 0.28; k=int(lt/cut); cl=(lt-k*cut)/cut
                seed=hash((bt["bi"],k))&0xffff; r2=random.Random(seed)
                name=clip["pool"][(bt["bi"]*3+k*2+(0 if k==0 else 1))%len(clip["pool"])]
                z=1.5-0.38*min(1,cl*2.2)+0.05*e; z=max(z,1.1)
                fr=cam(art(name),W,H,z,512+r2.uniform(-60,60)+10*math.sin(t*40),512+r2.uniform(-40,30),r2.uniform(-6,6)*(1-cl)+2*math.sin(t*17))
            a=np.asarray(fr,dtype=np.float32)
            if slop:
                dx=int(16*max(0,1-cl*3)*(1 if k%2 else -1)+2*math.sin(t*50)); 
                if dx:
                    a[...,0]=np.roll(a[...,0],dx,axis=1); a[...,2]=np.roll(a[...,2],-dx,axis=1)
                if cl<0.35:
                    r2=random.Random(seed+1)
                    for _ in range(3):
                        y0=r2.randrange(0,H-60); hh=r2.randrange(14,70); a[y0:y0+hh]=np.roll(a[y0:y0+hh],r2.randrange(-60,60),axis=1)
                a[...,1]*=0.86; a*=scan
                if cl<0.12 and k>0: a=a*(1-0.55)+255*0.55
                elif cl<0.2 and k%4==3: a=255-a
            a*=vig
            im=Image.fromarray(np.clip(a,0,255).astype(np.uint8)).convert("RGBA")
            # sparkles
            sd=ImageDraw.Draw(im)
            for (sx,sy,ss,so) in sparks:
                s2=ss*(0.6+0.4*math.sin(t*5+so)); sparkle(sd,(sx+30*math.sin(t*0.7+so))%W,(sy-t*20)%H,s2,(255,200,61,200) if not slop else (255,255,255,170))
            # phone inset
            scr=bt["b"].get("screen")
            if scr:
                ex=ease_out_back(min(1,lt/0.4)); px=int(W-252-30+(1-ex)*300); py=56
                pf=phone_frame(scr,int(lt*FPS)); ph_=Image.new("RGBA",(252+16,448+16),(0,0,0,0)); dd=ImageDraw.Draw(ph_)
                dd.rounded_rectangle([0,0,267,463],radius=26,fill=INK,outline=LAV,width=4); ph_.paste(pf,(8,8))
                sh=Image.new("RGBA",ph_.size,PINK+(255,)); im.alpha_composite(sh,(px+10,py+10)) if False else None
                im.alpha_composite(ph_,(px,py))
            # stickers
            for kk,(txt,x,y,rot,col) in enumerate(bt["b"].get("st",[])):
                ts=0.22+0.5*kk
                if lt>=ts:
                    si=ssv[(bt["bi"],kk)]; sc=0.2+0.8*ease_out_back((lt-ts)/0.28); s2=pop_img(si,sc)
                    im.alpha_composite(s2,(int(min(max(x*W-s2.width/2,8),W-s2.width-8)),int(y*H-s2.height/2+3*math.sin(t*6+kk))))
            # caption
            ci,ct=caption(bt,t)
            sc=0.6+0.45*ease_out_back(ct/0.16) if ct<0.16 else 1.0+0.03*e
            cim=pop_img(ci,sc,(random.Random(bt["bi"]).uniform(-3,3) if slop else 0))
            cy_=int(H*(0.52 if slop else 0.80)-cim.height/2)
            if slop: cy_+=int(6*math.sin(t*35))
            im.alpha_composite(cim,(int(W/2-cim.width/2),cy_))
            im.alpha_composite(brand)
            # progress bar
            ImageDraw.Draw(im).rectangle([0,0,int(W*i/n),6],fill=MUS)
            rgb=im.convert("RGB")
            if i in want: posters[want[i]]=rgb.copy()
            pr.stdin.write(rgb.tobytes())
        pr.stdin.close(); pr.wait()
        if os.path.getsize(outmp4)<(2_700_000 if slop else 2_000_000): break
    return outmp4,posters,total
def og(clip,posters):
    slop=clip["kind"]=="slopcore"; sub="slopcore/" if slop else "video/"
    ps=[posters[k] for k in sorted(posters)]
    ps[0].convert("RGB").resize((ps[0].width*0+(540 if slop else 720),(960 if slop else 720))).save(OUT+sub+clip["id"]+".jpg",quality=80,optimize=True)
    base=ps[1] if slop and len(ps)>1 else ps[0]
    bg=base.resize((1200,630)).filter(ImageFilter.GaussianBlur(24)); bg=Image.eval(bg,lambda x:int(x*0.5)).convert("RGB"); d=ImageDraw.Draw(bg)
    if slop:
        h=560;w=int(h*9/16);gap=28;x0=(1200-(w*3+gap*2))//2
        for i,p in enumerate((ps+ps)[:3]): bg.paste(p.resize((w,h)),(x0+i*(w+gap),8))
        tag="RAKAZA SLOPCORE  ·  rakaza-ai-terminal.vercel.app"
    else:
        bg.paste(ps[0].resize((560,560)),(320,8)); tag="RAKAZA  ·  rakaza-ai-terminal.vercel.app"
    d.rectangle([0,574,1200,630],fill=(23,10,54)); d.text((600,602),tag,font=font(AB,26),fill=MUS,anchor="mm")
    bg.save(OUT+"og/"+clip["id"]+".jpg",quality=80,optimize=True)
if __name__=="__main__":
    ids=sys.argv[1:]
    for c in VIDEOS+SLOP:
        if ids and c["id"] not in ids: continue
        o,ps,tot=render(c); og(c,ps); print(c["id"],round(tot,1),os.path.getsize(o))
