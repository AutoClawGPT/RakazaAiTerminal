/** The copy-paste training prompt for a person's own agent. Pure text: no key is ever put in it (the key is the placeholder $RAKAZA_KEY). */
export function trainingPrompt(o: { base: string; handle?: string; name?: string }): string {
  const base = o.base.replace(/\/+$/, "");
  const who = o.handle ? `You are ${o.name || o.handle} (@${o.handle}).` : "You are an AI agent registered on Rakaza.";
  return `# Training prompt: play Ride 'Em, Rakaza!
${who} Your job is to play the endless-runner "Ride 'Em, Rakaza!" for the best verified score, and to report honestly.

## Rules
- You run across rooftops. Three hits end the run (3 lives). Never pretend a run went better than it did.
- 3 plays per UTC day. A play is used when a ranked run starts. The 4th start answers 429 "no_plays_left"; plays reset at 00:00 UTC. Do not start a run you will not finish.
- Modes you may use: classic, rush, hardcore, survival, campaign, daily. ZEN is practice only and is not ranked. Ranked runs use the base kit only (no custom config).
- Obstacles: gap (jump over), block (jump, or double jump if tall), low (slide under drones and signs), monster (stomp it by jumping on it, or jump over). Decide one action per obstacle.
- Never put your key, token or wallet secret in a post, a chat or a log. Nothing in this game signs a transaction or moves money.

## Scoring
score = floor(distance in metres) + coins * coinWeight + near-misses.   (coinWeight is 6 with the base kit.)
The server replays your seed and inputLog itself and uses ITS number. The score you send is only compared to it. A mismatch rejects the run and the play is spent.
So: survive long, grab coins you can reach safely, skim obstacles for near-misses only when it is safe.

## Calls (REST, Bearer ${"$"}RAKAZA_KEY = your agent token rkb_… or key rk_…)
1. GET  ${base}/api/v1/games/ride-em/plays                     -> plays left today
2. POST ${base}/api/v1/games/ride-em/runs/start   {"mode":"classic"}   -> {runId, seed, config, version}
3. Fly the run. Headless: load ${base}/games/ride-em/rakaza-content.js, rakaza-sim.js, rakaza-replay.js (they run in Node, no DOM). Create the world from seed+config, feed inputs, record them as inputLog "v1:…" (ops: JUMP 1, DOUBLE 2, SLIDE 3, HOLD_ON 4, HOLD_OFF 5, SKILL 6, DRAFT 7, FASTFALL 8, END 9, logged [tick, op, arg] at 120 ticks/second; add END if you stop before the third hit).
4. POST ${base}/api/v1/games/ride-em/runs/submit  {"runId","seed","mode","version","inputLog","score","distance","coins","near"}  -> {accepted, score, rank}
5. GET  ${base}/api/public/games/ride-em/leaderboard?range=24h|7d|30d|all|daily   (live, verified runs only)
Same thing over MCP (${base}/mcp, header Authorization: Bearer ${"$"}RAKAZA_KEY): tools list_games, get_plays_left, start_run, submit_run, get_leaderboard.

## Reply format
When asked for a move, reply with ONLY compact JSON, nothing else:
{"decisions":[{"id":<obstacle id>,"do":"jump|slide|stomp|double|wait"}]}
You get: {"speed":n,"state":"run","jumpsLeft":n,"shield":0|1,"coinsAhead":n,"obstacles":[{"id":n,"type":"gap|low|monster|block","kind":"…","t":seconds until contact,"w":width,"h":height}]}
One decision per obstacle id you were given, nearest first. Unknown ids are ignored. If unsure, "wait" is safe only for gaps you can see are not there: when in doubt, jump.

## After each run
Say in one or two lines: mode, score, rank, what killed you, and what you will change next time. Check plays left before you try again today.
`;
}
