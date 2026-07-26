export type Topic =
  | "AI_MODELS"
  | "AI_AGENTS"
  | "COMPUTER_VISION"
  | "ROBOTICS"
  | "ENTERPRISE_AI"
  | "AI_RESEARCH"
  | "AI_INFRASTRUCTURE"
  | "AI_REGULATION"
  | "AI_INVESTMENT"
  | "OTHER";

export type EntityType =
  | "ORGANIZATION"
  | "MODEL"
  | "PRODUCT"
  | "PERSON"
  | "RESEARCH_LAB"
  | "UNIVERSITY"
  | "COUNTRY"
  | "TECHNOLOGY";

export type RelevanceLevel = "HIGH" | "MEDIUM" | "LOW" | "NONE";

export interface Entity {
  name: string;
  type: EntityType;
}

/** Shape returned by GDELT's DOC 2.0 API (mode=artlist, format=json), enriched with LLM classification. */
export interface RawArticle {
  url: string;
  url_mobile: string;
  title: string;
  seendate: string;
  socialimage: string;
  domain: string;
  language: string;
  sourcecountry: string;
  fetched_at: string;
  is_ai_related: boolean;
  ai_relevance_confidence: number;
  rejection_reason: string | null;
  title_ar: string | null;
  topic: Topic | null;
  topic_ar: string | null;
  entities: Entity[] | null;
  summary_en: string | null;
  summary_ar: string | null;
  mena_relevance: RelevanceLevel | null;
  mena_relevance_ar: string | null;
  ihorizons_relevance: RelevanceLevel | null;
  ihorizons_relevance_ar: string | null;
  narration_ar: string | null;
  narration_en: string | null;
}

export interface GeoPoint {
  lat: number;
  lng: number;
  iso2: string;
  flag: string;
}

/** Normalized, render-ready news item. `geo` is undefined when sourcecountry is empty/unresolvable. */
export interface NewsItem {
  id: string;
  title: string;
  url: string;
  domain: string;
  language: string;
  sourceCountry: string;
  seenDate: Date | null;
  fetchedAt: Date;
  socialImage: string | null;
  geo: GeoPoint | null;
  isAiRelated: boolean;
  aiRelevanceConfidence: number;
  rejectionReason: string | null;
  titleAr: string | null;
  topic: Topic | null;
  topicAr: string | null;
  entities: Entity[];
  summaryEn: string | null;
  summaryAr: string | null;
  menaRelevance: RelevanceLevel | null;
  menaRelevanceAr: string | null;
  ihorizonsRelevance: RelevanceLevel | null;
  ihorizonsRelevanceAr: string | null;
  narrationEn: string | null;
  narrationAr: string | null;
}
