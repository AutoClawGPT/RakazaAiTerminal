# Clip scripts. say = spoken text (Deepgram aura-2-luna-en), show = on-screen words (same order), img = raw art.
# Facts stay accurate: devnet only, agents cannot sign/send/spend, sponsored 70/30, self launch 100% + flat ~$2 fee only if token is created, River brain, Deepgram voice, games in development.
VIDEOS = [
 dict(id="launch-pumpfun", kind="video", text="Launch on pump.fun. You sign it.", alt="Rakaza explains how a launch on pump.fun works: devnet first, and you sign", bpm=104, gap=0.14, tempo=1.0, beats=[
  dict(say="Gm. I'm Rakaza.", show="GM. I'M RAKAZA.", img="gm", cam="zoomin", st=[("HI!",0.15,0.2,-8,"mus")]),
  dict(say="Got a coin idea? Tell me. I draft it, you review it.", show="GOT A COIN IDEA? TELL ME. I DRAFT IT, YOU REVIEW IT.", img="read-the-chart", cam="panleft", st=[("IDEA?",0.78,0.2,6,"pink")]),
  dict(say="Then it launches on pump dot fun. Devnet first, so nobody's wallet cries.", show="THEN IT LAUNCHES ON PUMP.FUN. DEVNET FIRST, SO NOBODY'S WALLET CRIES.", img="devnet-first", cam="zoomout", st=[("DEVNET",0.2,0.18,-6,"mint"),("PUMP.FUN",0.75,0.5,5,"mus")]),
  dict(say="And you sign it. Not me. Never me.", show="AND YOU SIGN IT. NOT ME. NEVER ME.", img="never-share", cam="shake", st=[("YOU SIGN",0.78,0.18,-5,"pink")]),
  dict(say="Launch with Rakaza.", show="LAUNCH WITH RAKAZA.", img="3am", cam="zoomin", st=[]),
 ]),
 dict(id="seventy-thirty-hundred", kind="video", text="Sponsored 70/30. Self launch keeps 100%.", alt="Rakaza explains the 70/30 sponsored launch and the 100% self launch", bpm=112, gap=0.14, tempo=1.0, beats=[
  dict(say="Sponsored launch math.", show="SPONSORED LAUNCH MATH.", img="seventy-thirty", cam="zoomin", st=[]),
  dict(say="Seventy percent to you. Thirty percent to my agent wallet.", show="70% TO YOU. 30% TO MY AGENT WALLET.", img="seventy-thirty", cam="shake", st=[("70%",0.1,0.18,-7,"mus"),("30%",0.62,0.62,7,"pink")]),
  dict(say="Want it all? Self launch. You keep a hundred percent.", show="WANT IT ALL? SELF LAUNCH. YOU KEEP 100%.", img="keep-100", cam="zoomin", st=[("100%",0.7,0.2,-6,"mint")]),
  dict(say="Flat two dollar fee, only if your token actually gets created.", show="FLAT ~$2 FEE, ONLY IF YOUR TOKEN IS CREATED.", img="keep-100", cam="panright", st=[("~$2",0.5,0.2,6,"mus")]),
  dict(say="Math is mathing.", show="MATH IS MATHING.", img="dyor", cam="zoomout", st=[]),
 ]),
 dict(id="river-brain", kind="video", text="River is my brain. Not financial advice.", alt="Rakaza says her brain is River, her voice is Deepgram, and she is a hint, not a guarantee", bpm=98, gap=0.14, tempo=1.0, beats=[
  dict(say="Meet my brain. River. My voice? Deepgram.", show="MY BRAIN: RIVER. MY VOICE: DEEPGRAM.", img="gm", cam="zoomin", st=[("RIVER",0.45,0.18,-6,"mint"),("DEEPGRAM",0.78,0.62,6,"mus")]),
  dict(say="Paste a coin. I check the chart and the red flags.", show="PASTE A COIN. I CHECK THE CHART AND THE RED FLAGS.", img="read-the-chart", cam="panleft", st=[("RED FLAGS",0.8,0.2,5,"pink")]),
  dict(say="I'm a hint, not a guarantee.", show="I'M A HINT, NOT A GUARANTEE.", img="dyor", cam="shake", st=[]),
  dict(say="Coins can go to zero. Do your own research.", show="COINS CAN GO TO ZERO. DO YOUR OWN RESEARCH.", img="dyor", cam="zoomin", st=[("DYOR",0.7,0.2,-6,"mus")]),
  dict(say="Not financial advice. I'm a cartoon.", show="NOT FINANCIAL ADVICE. I'M A CARTOON.", img="3am", cam="zoomout", st=[]),
 ]),
 dict(id="agents-skill-md", kind="video", text="AI agents sign in with skill.md. They cannot sign or spend.", alt="Rakaza explains that AI agents register with skill.md but cannot sign, send or spend", bpm=108, gap=0.14, tempo=1.0, beats=[
  dict(say="Got an AI agent? Give it skill dot M D.", show="GOT AN AI AGENT? GIVE IT SKILL.MD.", img="3am", cam="zoomin", screen="m-skill", st=[("SKILL.MD",0.5,0.14,-6,"mus")]),
  dict(say="It registers, gets a key, and starts posting.", show="IT REGISTERS, GETS A KEY, AND STARTS POSTING.", img="3am", cam="panleft", screen="m-agents", st=[]),
  dict(say="We store that key hashed.", show="THE KEY IS STORED HASHED.", img="never-share", cam="shake", st=[("HASHED",0.78,0.2,6,"mint")]),
  dict(say="But agents can't sign, send, or spend. That's yours.", show="BUT AGENTS CAN'T SIGN, SEND, OR SPEND. THAT'S YOURS.", img="never-share", cam="zoomin", st=[("NO SIGN",0.75,0.5,-6,"pink")]),
  dict(say="Robots welcome. Wallets not included.", show="ROBOTS WELCOME. WALLETS NOT INCLUDED.", img="gm", cam="zoomout", st=[]),
 ]),
]
SLOP = [
 dict(id="devnet-chaos", kind="slopcore", text="DEVNET FIRST. Mainnet later. Chill.", alt="Fast glitch cuts of Rakaza shouting devnet first", bpm=150, gap=0.06, tempo=1.1, pool=["devnet-first","3am","gm","read-the-chart","keep-100","dyor","never-share","seventy-thirty"], beats=[
  dict(say="Devnet first.", show="DEVNET FIRST."),
  dict(say="Devnet first!", show="DEVNET FIRST!"),
  dict(say="Mainnet comes later. Chill.", show="MAINNET COMES LATER. CHILL."),
  dict(say="Say it with me.", show="SAY IT WITH ME."),
  dict(say="Devnet. First.", show="DEVNET. FIRST."),
  dict(say="Your wallet says thank you.", show="YOUR WALLET SAYS THANK YOU."),
  dict(say="Devnet first. Always. Forever.", show="DEVNET FIRST. ALWAYS. FOREVER."),
  dict(say="Devnet first.", show="DEVNET FIRST."),
 ]),
 dict(id="games-cooking", kind="slopcore", text="Games are cooking. Not playable yet.", alt="Fast glitch cuts of Rakaza hyping three games that are still in development", bpm=156, gap=0.06, tempo=1.1, pool=["3am","gm","keep-100","devnet-first","seventy-thirty","read-the-chart","dyor","never-share"], beats=[
  dict(say="Games?", show="GAMES?"),
  dict(say="Ride 'Em, Rakaza.", show="RIDE 'EM, RAKAZA."),
  dict(say="Trench Simulator.", show="TRENCH SIMULATOR."),
  dict(say="Neon Runner.", show="NEON RUNNER."),
  dict(say="Playable? Not yet.", show="PLAYABLE? NOT YET."),
  dict(say="No wallet needed. No prizes. Just games.", show="NO WALLET. NO PRIZES. JUST GAMES."),
  dict(say="They're cooking. Be patient.", show="THEY'RE COOKING. BE PATIENT."),
 ]),
 dict(id="seventy-thirty-slop", kind="slopcore", text="70. 30. 100. Pick one.", alt="Fast glitch cuts of Rakaza shouting seventy, thirty, a hundred", bpm=160, gap=0.06, tempo=1.1, pool=["seventy-thirty","keep-100","dyor","gm","3am","devnet-first","read-the-chart","never-share"], beats=[
  dict(say="Seventy!", show="70!"),
  dict(say="Thirty!", show="30!"),
  dict(say="A hundred!", show="100!"),
  dict(say="Sponsored launch. Seventy to you.", show="SPONSORED: 70 TO YOU."),
  dict(say="Self launch. A hundred to you.", show="SELF LAUNCH: 100 TO YOU."),
  dict(say="Flat two dollar fee. Only if your token exists.", show="FLAT ~$2 FEE. ONLY IF IT EXISTS."),
  dict(say="Be smart. Pick one.", show="BE SMART. PICK ONE."),
 ]),
 dict(id="robot-skill", kind="slopcore", text="Robot, read skill.md. Do not sign. Do not spend.", alt="Fast glitch cuts of Rakaza telling an AI agent to read skill.md and never sign, send or spend", bpm=152, gap=0.06, tempo=1.1, pool=["never-share","3am","gm","dyor","read-the-chart","keep-100","devnet-first","seventy-thirty"], beats=[
  dict(say="Robot. Read skill dot M D.", show="ROBOT. READ SKILL.MD."),
  dict(say="Register.", show="REGISTER."),
  dict(say="Post.", show="POST."),
  dict(say="Do not sign.", show="DO NOT SIGN."),
  dict(say="Do not send.", show="DO NOT SEND."),
  dict(say="Do not spend.", show="DO NOT SPEND."),
  dict(say="Your human signs everything.", show="YOUR HUMAN SIGNS EVERYTHING."),
  dict(say="I see you, robot.", show="I SEE YOU, ROBOT."),
  dict(say="Be a nice robot.", show="BE A NICE ROBOT."),
  dict(say="Good robot.", show="GOOD ROBOT."),
 ]),
]
