/**
 * Skill Extraction Service
 *
 * Analyzes video transcripts to:
 * 1. Identify skills being taught (e.g., "rose_pruning", "propagation")
 * 2. Determine skill level (beginner, intermediate, advanced, expert)
 * 3. Assess teaching quality and coverage
 * 4. Extract timestamps for skill-focused segments
 * 5. Reformulate titles for high-intent search queries
 * 6. Position video in learning sequence
 *
 * Ported from monolith lib/services/skill-extraction-service.ts.
 * Standalone: uses OpenAI SDK directly, no Prisma or monolith dependencies.
 * The database-save functions (saveVideoSkills, processVideoForSkills, etc.)
 * are intentionally omitted -- the MCP consumer handles persistence.
 */

import OpenAI from "openai";
import type { Logger } from "../types.js";
import { defaultLogger } from "../types.js";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Skill Analysis Result
 *
 * OPTIMIZATION: Removed unused engagement features (saves 33% cost)
 * Previous cost: $0.003/video -> New cost: $0.002/video
 */
export interface SkillAnalysis {
  // Primary skill taught
  primarySkill: {
    name: string; // "rose_pruning"
    displayName: string; // "Rose Pruning"
    category: string; // "plant_species" | "technique" | "seasonal_task" | "garden_style"
    skillLevel: string; // "beginner" | "intermediate" | "advanced" | "expert"
    coveragePercent: number; // 0-100
  };

  // Additional skills covered
  secondarySkills: Array<{
    name: string;
    displayName: string;
    category: string;
    skillLevel: string;
    coveragePercent: number;
  }>;

  // Teaching quality metrics
  quality: {
    explanationQuality: number; // 0-100: How well explained?
    visualQuality: number; // 0-100: Visual demonstrations
    practicalValue: number; // 0-100: Actionable takeaways
    overallScore: number; // 0-100: Combined quality
  };

  // Video intent
  intent: {
    type:
      | "how_to"
      | "explainer"
      | "demonstration"
      | "tips"
      | "troubleshooting"
      | "review"
      | "showcase";
    confidence: number; // 0-100
    reformulatedTitle: string; // High-intent version
  };

  // Sequence positioning
  sequencing: {
    position:
      | "foundational"
      | "beginner"
      | "intermediate"
      | "advanced"
      | "expert"
      | "specialized";
    prerequisiteSkills: string[]; // Skills needed before this
    nextSkillSuggestions: string[]; // Skills to learn next
  };

  // Timestamps for skill-focused segments
  timestamps: Array<{
    skill: string;
    start: string; // "00:02:14"
    end: string; // "00:05:30"
    context: string; // What's happening in this segment
  }>;
}

/**
 * Action Intent Signal (for selective injection)
 */
export interface ActionIntentSignal {
  timestamp: string;
  keyword: string;
  label: string;
  intentScore: number;
  intentStrength: "low" | "medium" | "high";
  category: string;
}

/**
 * Options for skill extraction.
 */
export interface SkillExtractionOptions {
  apiKey: string;
  model?: string;
  logger?: Logger;
}

// ============================================================================
// SKILL EXTRACTION
// ============================================================================

/**
 * Extract skills from a video transcript using AI.
 *
 * Supports optional action intent signals for improved accuracy.
 * Returns structured skill analysis with quality metrics and sequencing.
 *
 * @param transcript - Full transcript text
 * @param videoTitle - Title of the video
 * @param options - API key and optional settings
 * @param videoDescription - Optional video description for context
 * @param detectedActions - Optional action signals from preprocessing
 * @returns Structured skill analysis
 */
export async function extractVideoSkills(
  transcript: string,
  videoTitle: string,
  options: SkillExtractionOptions,
  videoDescription?: string,
  detectedActions?: ActionIntentSignal[],
): Promise<SkillAnalysis> {
  const logger = options.logger ?? defaultLogger;
  const model = options.model ?? "gpt-4o-mini";

  logger.info("Analyzing video for skills", { videoTitle });

  const openai = new OpenAI({ apiKey: options.apiKey });

  // SELECTIVE ACTION INJECTION
  // Only inject high-confidence garden task actions
  const highIntentActions = detectedActions
    ?.filter(
      (action) =>
        action.category === "garden_task" &&
        action.intentStrength === "high" &&
        action.intentScore >= 7,
    )
    .slice(0, 6); // Max 6 actions to avoid token bloat

  // Build action context only if high-quality actions exist
  const actionContext =
    highIntentActions && highIntentActions.length > 0
      ? `

DETECTED TEACHING MOMENTS (high-confidence action intents):
${highIntentActions.map((a) => `- [${a.timestamp}] ${a.label} (intent score: ${a.intentScore})`).join("\n")}

IMPORTANT: These action intents indicate WHERE and WHAT is actively being TAUGHT (not just mentioned).
Use these as strong signals for:
- Primary/secondary skill identification (prioritize skills matching these actions)
- Coverage percentage estimation (use timestamps to calculate)
- Timestamp accuracy (align skill timestamps with action timestamps)
- Teaching quality assessment (high-intent actions = better teaching)
`
      : "";

  const prompt = `You are an expert at analyzing educational gardening videos to identify skills and assess teaching quality.

VIDEO TITLE: ${videoTitle}
${videoDescription ? `DESCRIPTION: ${videoDescription}\n` : ""}

TRANSCRIPT:
${transcript.slice(0, 15000)} ${transcript.length > 15000 ? "...(truncated)" : ""}${actionContext}

TASK: Analyze this video and extract:

1. PRIMARY SKILL: The main skill being taught
   - Skill name (snake_case): e.g., "rose_pruning", "seed_starting", "composting"
   - Display name: e.g., "Rose Pruning"
   - Category: "plant_species", "technique", "garden_style", "seasonal_task"
   - Skill level: "beginner", "intermediate", "advanced", "expert"
   - Coverage percent: How much of the video focuses on this skill? (0-100)

2. SECONDARY SKILLS: Other skills mentioned (max 3)
   - Same structure as primary skill

3. TEACHING QUALITY (0-100 for each):
   - Explanation quality: How clearly are concepts explained?
   - Visual quality: Are there good visual demonstrations?
   - Practical value: Are there actionable takeaways?
   - Overall score: Combined quality assessment

4. VIDEO INTENT:
   - Type: "how_to" (step-by-step), "explainer" (concepts), "demonstration" (showing),
           "tips" (quick advice), "troubleshooting" (solving problems), "review" (comparing/evaluating),
           "showcase" (tour/display)
   - Confidence: How confident are you in this classification? (0-100)
   - Reformulated title: Rewrite the title as a high-intent search query (e.g., "How to Prune Roses in Spring")
     Use phrases like: "How to...", "Guide to...", "Learn...", "Master...", "Complete Guide..."

5. SEQUENCE POSITION:
   - Position: "foundational" (absolute basics), "beginner" (first real project),
               "intermediate" (building on basics), "advanced" (complex techniques),
               "expert" (mastery level), "specialized" (niche topic)
   - Prerequisites: What skills should learner have first? (max 3, use empty array if none)
   - Next steps: What skills naturally follow this? (max 3, use empty array if none)

6. TIMESTAMPS: Key segments where skills are taught (max 5)
   - Skill name, start time (HH:MM:SS), end time (HH:MM:SS), brief context

Return as JSON:
{
  "primarySkill": {
    "name": "string",
    "displayName": "string",
    "category": "string",
    "skillLevel": "string",
    "coveragePercent": number
  },
  "secondarySkills": [
    {
      "name": "string",
      "displayName": "string",
      "category": "string",
      "skillLevel": "string",
      "coveragePercent": number
    }
  ],
  "quality": {
    "explanationQuality": number,
    "visualQuality": number,
    "practicalValue": number,
    "overallScore": number
  },
  "intent": {
    "type": "string",
    "confidence": number,
    "reformulatedTitle": "string"
  },
  "sequencing": {
    "position": "string",
    "prerequisiteSkills": ["string"],
    "nextSkillSuggestions": ["string"]
  },
  "timestamps": [
    {
      "skill": "string",
      "start": "00:00:00",
      "end": "00:00:00",
      "context": "string"
    }
  ]
}`;

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are an expert educational content analyst specializing in gardening and horticulture. Return only valid JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const choice = response.choices[0];
    if (!choice) {
      throw new Error("No response choice from OpenAI");
    }
    const content = choice.message.content;
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    const analysis: SkillAnalysis = JSON.parse(content);

    logger.info("Skill extraction result", {
      primarySkill: analysis.primarySkill.displayName,
      skillLevel: analysis.primarySkill.skillLevel,
      qualityScore: analysis.quality.overallScore,
      intentType: analysis.intent.type,
      reformulatedTitle: analysis.intent.reformulatedTitle,
    });

    return analysis;
  } catch (error) {
    logger.error(
      "Skill extraction failed",
      error instanceof Error ? error : undefined,
      { videoTitle },
    );
    throw error;
  }
}
