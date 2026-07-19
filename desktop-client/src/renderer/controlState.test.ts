import { describe, expect, it } from "vitest";
import { getRecorderControlState } from "./controlState";

describe("getRecorderControlState", () => {
  it("starts from idle and stopped states", () => {
    expect(getRecorderControlState("Idle").primary).toBe("start");
    expect(getRecorderControlState("Stopped").primary).toBe("start");
  });

  it("pauses while recording and keeps stop available", () => {
    expect(getRecorderControlState("Recording")).toMatchObject({ primary: "pause", showStop: true });
  });

  it("resumes from pause and keeps stop available", () => {
    expect(getRecorderControlState("Paused")).toMatchObject({ primary: "resume", showStop: true });
  });

  it("offers recovery after an error", () => {
    expect(getRecorderControlState("Error")).toMatchObject({ primary: "start", primaryLabel: "重新开始", showStop: false });
  });
});
