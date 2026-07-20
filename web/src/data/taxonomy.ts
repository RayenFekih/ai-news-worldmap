import type { EntityType, RelevanceLevel, Topic } from "./types";

export const TOPIC_LABELS: Record<Topic, string> = {
  AI_MODELS: "AI Models",
  AI_AGENTS: "AI Agents",
  COMPUTER_VISION: "Computer Vision",
  ROBOTICS: "Robotics",
  ENTERPRISE_AI: "Enterprise AI",
  AI_RESEARCH: "AI Research",
  AI_INFRASTRUCTURE: "AI Infrastructure",
  AI_REGULATION: "AI Regulation",
  AI_INVESTMENT: "AI Investment",
  OTHER: "Other",
};

/** Validated 8-hue dark/categorical palette; AI_INVESTMENT shares OTHER's neutral slot (9 topics, 8 hues). */
export const TOPIC_COLORS: Record<Topic, string> = {
  AI_MODELS: "#3987e5",
  ENTERPRISE_AI: "#008300",
  AI_REGULATION: "#d55181",
  AI_INFRASTRUCTURE: "#c98500",
  AI_RESEARCH: "#199e70",
  ROBOTICS: "#d95926",
  AI_AGENTS: "#9085e9",
  COMPUTER_VISION: "#e66767",
  AI_INVESTMENT: "#7f93ac",
  OTHER: "#7f93ac",
};

/** Same 8 hues, reused for the unrelated EntityType dimension — kept as a separate map on purpose. */
export const ENTITY_TYPE_COLORS: Record<EntityType, string> = {
  ORGANIZATION: "#3987e5",
  MODEL: "#008300",
  PRODUCT: "#d55181",
  PERSON: "#c98500",
  RESEARCH_LAB: "#199e70",
  UNIVERSITY: "#d95926",
  COUNTRY: "#9085e9",
  TECHNOLOGY: "#e66767",
};

/** Ordinal HIGH->NONE ramp, shared by mena_relevance and ihorizons_relevance (same meaning, two axes). */
export const RELEVANCE_COLORS: Record<RelevanceLevel, string> = {
  HIGH: "#5dd3ff",
  MEDIUM: "#4fb8e0",
  LOW: "#2f7a99",
  NONE: "#3d4f60",
};

export const RELEVANCE_LABELS: Record<RelevanceLevel, string> = {
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
  NONE: "None",
};

/** Arabic value labels for the mirrored Arabic story panel - "MENA"/"iHorizons" stay as-is (proper
 * nouns commonly left in Latin script in Arabic business writing), but the value itself shouldn't
 * be English text sitting inside an otherwise-Arabic box. */
export const RELEVANCE_LABELS_AR: Record<RelevanceLevel, string> = {
  HIGH: "مرتفعة",
  MEDIUM: "متوسطة",
  LOW: "منخفضة",
  NONE: "غير محددة",
};
