import { describe, it, expect, vi } from "vitest";
import {
  buildEvaluationPrompt,
  createAIEvaluator,
  type AIEvaluationRequest,
} from "../../market-intelligence/ai-composite-evaluator.js";
import type { CriterionResult } from "../../market-intelligence/channel-vetting.js";

const makeCriterion = (
  criterionId: CriterionResult["criterionId"],
  score: number,
  confidence: number,
): CriterionResult => ({ criterionId, score, confidence, evidence: [], flags: [] });

const BASE: AIEvaluationRequest = {
  channelName: "TestChannel",
  videoTitles: ["Title One", "Title Two"],
  existingScores: [],
};

describe("buildEvaluationPrompt", () => {
  it("includes channel name", () => {
    expect(buildEvaluationPrompt(BASE)).toContain("TestChannel");
  });

  it("falls back to 'No description available' when description absent", () => {
    expect(buildEvaluationPrompt(BASE)).toContain("No description available");
  });

  it("shows description when provided", () => {
    const req = { ...BASE, channelDescription: "Organic gardening tips" };
    expect(buildEvaluationPrompt(req)).toContain("Organic gardening tips");
  });

  it("slices videoTitles to at most 5", () => {
    const titles = ["A", "B", "C", "D", "E", "F", "G"];
    const prompt = buildEvaluationPrompt({ ...BASE, videoTitles: titles });
    expect(prompt).toContain("A, B, C, D, E");
    expect(prompt).not.toContain(", F");
  });

  it("formats criterion scores as 'id: score/100 (confidence: XX%)'", () => {
    const scores = [makeCriterion("published_books", 80, 0.9)];
    const prompt = buildEvaluationPrompt({ ...BASE, existingScores: scores });
    expect(prompt).toContain("published_books: 80/100 (confidence: 90%)");
  });

  it("handles zero score and zero confidence", () => {
    const scores = [makeCriterion("media_presence", 0, 0)];
    const prompt = buildEvaluationPrompt({ ...BASE, existingScores: scores });
    expect(prompt).toContain("media_presence: 0/100 (confidence: 0%)");
  });

  it("includes all 7 evaluation criteria labels", () => {
    const prompt = buildEvaluationPrompt(BASE);
    for (const label of [
      "Published Books", "Editorial Vetting", "Media Presence",
      "Professional Credentials", "Institutional Affiliation",
      "Ethical Alignment", "Production Quality",
    ]) {
      expect(prompt).toContain(label);
    }
  });

  it("embeds JSON response template with suggestedScore key", () => {
    expect(buildEvaluationPrompt(BASE)).toContain('"suggestedScore"');
  });
});

describe("createAIEvaluator", () => {
  const aiResponse = {
    overallAssessment: "good", suggestedScore: 75, confidence: 0.9,
    reasoning: "r", recommendsHumanReview: false,
  };
  const fakeClient = { complete: vi.fn().mockResolvedValue({ content: JSON.stringify(aiResponse) }) };

  const CHANNEL = { id: "1", channelId: "ch1", channelName: "GardenWorld", channelUrl: "https://example.com" };

  it("returns a callable function", () => {
    expect(typeof createAIEvaluator(fakeClient)).toBe("function");
  });

  it("returned function passes channel name into the AI prompt", async () => {
    fakeClient.complete.mockClear();
    const evaluator = createAIEvaluator(fakeClient, ["vid1"]);
    await evaluator(CHANNEL as never, []);
    expect(fakeClient.complete).toHaveBeenCalledOnce();
    const args = fakeClient.complete.mock.calls[0][0] as { userPrompt: string };
    expect(args.userPrompt).toContain("GardenWorld");
  });
});
