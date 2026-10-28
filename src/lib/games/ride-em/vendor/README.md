Byte-identical copies of public/games/ride-em/rakaza-{content,sim,replay}.js: the browser game and the server referee run the same simulation.
A unit test (tests/games-ride-em.test.ts) fails if the copies drift. Update all copies together when the game version changes.
