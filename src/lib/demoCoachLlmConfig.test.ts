import { describe, expect, it } from "vitest";
import {
  buildDemoCoachLlmIdMapEnvValue,
  DEMO_COACH_LLM_SEED_UUIDS,
  validateDemoCoachLlmConfig,
} from "./demoCoachLlmConfig";

describe("validateDemoCoachLlmConfig", () => {
  it("passes when disabled", () => {
    expect(
      validateDemoCoachLlmConfig({
        enabled: false,
        gateToken: "",
        idMap: {},
      }),
    ).toBeNull();
  });

  it("requires gate token and full id map when enabled", () => {
    expect(
      validateDemoCoachLlmConfig({
        enabled: true,
        gateToken: "",
        idMap: DEMO_COACH_LLM_SEED_UUIDS,
      }),
    ).toMatch(/VITE_COACH_DEMO_GATE_TOKEN/);

    expect(
      validateDemoCoachLlmConfig({
        enabled: true,
        gateToken: "gate",
        idMap: { "c-sea": DEMO_COACH_LLM_SEED_UUIDS["c-sea"] },
      }),
    ).toMatch(/missing "a-alice"/);
  });

  it("documents the canonical env map", () => {
    expect(JSON.parse(buildDemoCoachLlmIdMapEnvValue())).toEqual(DEMO_COACH_LLM_SEED_UUIDS);
  });
});
