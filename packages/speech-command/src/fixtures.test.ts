import { describe, expect, it } from "vitest";
import { SpeechCommandFixtures } from "./fixtures.ts";

describe("speech command fixtures", () => {
  it("use stable unique identifiers and realistic rough transcripts", () => {
    const ids = SpeechCommandFixtures.map((fixture) => fixture.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(SpeechCommandFixtures.length).toBeGreaterThanOrEqual(6);
    expect(
      SpeechCommandFixtures.some((fixture) => /\buh\b|\bum\b/i.test(fixture.transcript)),
    ).toBe(true);
  });
});
