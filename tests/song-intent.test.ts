import test from "node:test";
import assert from "node:assert/strict";
import { songIntent } from "../src/lib/stage/song-intent";

test("asks for a song", () => {
  for (const t of ["sing me a song", "Sing a song please", "can you sing?", "make me a song about pizza", "write a song about the moon!", "play a song", "rap for me", "sing", "I want a song", "give me a tune"])
    assert.ok(songIntent(t), t);
});
test("pulls out a topic", () => {
  assert.equal(songIntent("make me a song about pizza")?.topic, "pizza");
  assert.equal(songIntent("sing me a song about the moon")?.topic, "moon");
  assert.equal(songIntent("sing me a song")?.topic, null);
});
test("normal chat is not a song request", () => {
  for (const t of ["how do I launch a coin?", "what is the song of the day on the radio", "hello there", "what does sponsored launch mean", "", "tell me about River"]) assert.equal(songIntent(t), null, t);
});
