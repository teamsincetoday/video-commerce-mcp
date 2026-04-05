import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreate = vi.fn();
vi.mock("openai", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: vi.fn().mockImplementation(function (this: any) {
    this.chat = { completions: { create: mockCreate } };
  }),
}));

import { AIOrchestrator, createAIOrchestrator } from "../../ai/ai-orchestrator.js";

const TASK = { transcript: "We planted roses and pruned tomatoes.", videoId: "vid-1" };

const resolve = (content: string, usage = { prompt_tokens: 100, completion_tokens: 50 }) =>
  mockCreate.mockResolvedValue({ choices: [{ message: { content } }], usage });

describe("AIOrchestrator", () => {
  let orch: AIOrchestrator;

  beforeEach(() => {
    mockCreate.mockReset();
    orch = new AIOrchestrator({ apiKey: "test-key" });
  });

  it("getStats() initialises all counters at zero", () => {
    const s = orch.getStats();
    expect(s.totalCalls).toBe(0);
    expect(s.totalTokens).toBe(0);
    expect(s.totalCost).toBe(0);
    expect(s.callsSaved).toBe(0);
    expect(s.avgTokensPerCall).toBe(0);
    expect(s.savingsPercentage).toBe("0%");
  });

  it("resetStats() clears counters after a call", async () => {
    resolve(JSON.stringify({ language: { code: "en", name: "English", confidence: 99 } }));
    await orch.processVideo({ ...TASK, includeLanguageDetection: true });
    orch.resetStats();
    expect(orch.getStats()).toMatchObject({ totalCalls: 0, totalTokens: 0, totalCost: 0 });
  });

  it("processVideo returns videoId and passes through parsed fields", async () => {
    const payload = { language: { code: "nl", name: "Dutch", confidence: 95 }, entities: [] };
    resolve(JSON.stringify(payload));
    const r = await orch.processVideo({ ...TASK, includeLanguageDetection: true, includeEntityExtraction: true });
    expect(r.videoId).toBe("vid-1");
    expect(r.language?.code).toBe("nl");
    expect(r.entities).toEqual([]);
  });

  it("strips markdown code fences from AI response before parsing", async () => {
    resolve("```json\n{\"commerceItems\":[{\"name\":\"spade\"}]}\n```");
    const r = await orch.processVideo({ ...TASK, includeCommerceItems: true });
    expect(r.commerceItems?.[0]?.name).toBe("spade");
  });

  it("updates totalCalls, totalTokens and avgTokensPerCall in stats", async () => {
    resolve("{}", { prompt_tokens: 200, completion_tokens: 100 });
    await orch.processVideo(TASK);
    expect(orch.getStats()).toMatchObject({ totalCalls: 1, totalTokens: 300, avgTokensPerCall: 300 });
  });

  it("callsSaved = sum-of-task-flags minus 1 (batching saving)", async () => {
    resolve("{}");
    // 3 tasks → unbatchedCalls=3 → callsSaved=2
    await orch.processVideo({ ...TASK, includeLanguageDetection: true, includeEntityExtraction: true, includeCommerceItems: true });
    expect(orch.getStats().callsSaved).toBe(2);
  });

  it("rethrows errors from OpenAI without swallowing", async () => {
    mockCreate.mockRejectedValue(new Error("rate limit exceeded"));
    await expect(orch.processVideo(TASK)).rejects.toThrow("rate limit exceeded");
  });
});

describe("createAIOrchestrator", () => {
  it("throws when no key is provided and OPENAI_API_KEY is unset", () => {
    const saved = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      expect(() => createAIOrchestrator()).toThrow("OPENAI_API_KEY");
    } finally {
      if (saved !== undefined) process.env.OPENAI_API_KEY = saved;
    }
  });

  it("returns an AIOrchestrator instance when given an explicit key", () => {
    expect(createAIOrchestrator("my-key")).toBeInstanceOf(AIOrchestrator);
  });
});
