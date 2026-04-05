import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ActionIntentSignal } from "../../intelligence/skill-extraction.js";

const mockCreate = vi.fn();
vi.mock("openai", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: vi.fn().mockImplementation(function (this: any) {
    this.chat = { completions: { create: mockCreate } };
  }),
}));

import { extractVideoSkills } from "../../intelligence/skill-extraction.js";

const VALID = {
  primarySkill: { name: "rose_pruning", displayName: "Rose Pruning", category: "technique", skillLevel: "beginner", coveragePercent: 80 },
  secondarySkills: [],
  quality: { explanationQuality: 70, visualQuality: 65, practicalValue: 75, overallScore: 70 },
  intent: { type: "how_to", confidence: 90, reformulatedTitle: "How to Prune Roses" },
  sequencing: { position: "beginner", prerequisiteSkills: [], nextSkillSuggestions: [] },
  timestamps: [],
};

const OPTS = { apiKey: "test-key" };
const resolve = (data: unknown) =>
  mockCreate.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(data) } }] });

describe("extractVideoSkills", () => {
  beforeEach(() => mockCreate.mockReset());

  it("parses SkillAnalysis on success", async () => {
    resolve(VALID);
    const r = await extractVideoSkills("some transcript", "Pruning Roses", OPTS);
    expect(r.primarySkill.name).toBe("rose_pruning");
    expect(r.quality.overallScore).toBe(70);
    expect(r.intent.reformulatedTitle).toBe("How to Prune Roses");
  });

  it("throws when choices array is empty", async () => {
    mockCreate.mockResolvedValue({ choices: [] });
    await expect(extractVideoSkills("t", "v", OPTS)).rejects.toThrow("No response choice");
  });

  it("throws when message content is null", async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: null } }] });
    await expect(extractVideoSkills("t", "v", OPTS)).rejects.toThrow("Empty response");
  });

  it("throws on malformed JSON", async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: "{bad" } }] });
    await expect(extractVideoSkills("t", "v", OPTS)).rejects.toThrow();
  });

  it("uses gpt-4o-mini by default and omits teaching-moments block without actions", async () => {
    resolve(VALID);
    await extractVideoSkills("t", "v", OPTS);
    const call = mockCreate.mock.calls[0]?.[0];
    expect(call.model).toBe("gpt-4o-mini");
    expect((call.messages[1].content as string)).not.toContain("DETECTED TEACHING MOMENTS");
  });

  it("omits DETECTED TEACHING MOMENTS when all actions fail the filter", async () => {
    const actions: ActionIntentSignal[] = [
      { timestamp: "00:01:00", keyword: "cut", label: "cutting", intentScore: 9, intentStrength: "high", category: "technique" },
      { timestamp: "00:02:00", keyword: "water", label: "watering", intentScore: 9, intentStrength: "medium", category: "garden_task" },
      { timestamp: "00:03:00", keyword: "plant", label: "planting", intentScore: 5, intentStrength: "high", category: "garden_task" },
    ];
    resolve(VALID);
    await extractVideoSkills("t", "v", OPTS, undefined, actions);
    expect((mockCreate.mock.calls[0]?.[0].messages[1].content as string)).not.toContain("DETECTED TEACHING MOMENTS");
  });

  it("injects matching garden_task actions and excludes non-matching ones", async () => {
    const actions: ActionIntentSignal[] = [
      { timestamp: "00:01:00", keyword: "prune", label: "pruning-roses", intentScore: 8, intentStrength: "high", category: "garden_task" },
      { timestamp: "00:02:00", keyword: "cut", label: "stem-cutting", intentScore: 9, intentStrength: "high", category: "technique" },
      { timestamp: "00:03:00", keyword: "water", label: "deep-watering", intentScore: 9, intentStrength: "medium", category: "garden_task" },
      { timestamp: "00:04:00", keyword: "seed", label: "seed-planting", intentScore: 6, intentStrength: "high", category: "garden_task" },
    ];
    resolve(VALID);
    await extractVideoSkills("t", "v", OPTS, undefined, actions);
    const content = mockCreate.mock.calls[0]?.[0].messages[1].content as string;
    expect(content).toContain("pruning-roses");
    expect(content).not.toContain("stem-cutting");
    expect(content).not.toContain("deep-watering");
    expect(content).not.toContain("seed-planting");
  });

  it("caps injected actions at 6 even when more qualify", async () => {
    const actions: ActionIntentSignal[] = Array.from({ length: 9 }, (_, i) => ({
      timestamp: "00:00:00", keyword: "k", label: `action-${i}`, intentScore: 9, intentStrength: "high" as const, category: "garden_task",
    }));
    resolve(VALID);
    await extractVideoSkills("t", "v", OPTS, undefined, actions);
    const content = mockCreate.mock.calls[0]?.[0].messages[1].content as string;
    expect(content).toContain("action-5");
    expect(content).not.toContain("action-6");
  });
});
