/** Normalized taste-graph records. Field names are ours; the live client maps Qloo's payload into this shape. */

export type TasteTag = {
  id: string;
  name: string;
  type: string;
  affinity?: number | null;
};

export type Explainer = {
  id: string;
  name: string;
  score: number;
};

export type TasteEntity = {
  id: string;
  name: string;
  /** Qloo subtype URN, for example `urn:entity:artist`. */
  type: string;
  description: string | null;
  imageUrl: string | null;
  popularity: number | null;
  /** Affinity to the signals that produced this row, 0–1. Null on search hits. */
  affinity: number | null;
  tags: TasteTag[];
  explainers: Explainer[];
  /** True when this row came from the local fixture graph, not the Qloo API. */
  mock: boolean;
  /** Set by search so weak name matches can be dropped. Not part of the compiled room. */
  matchScore?: number;
};

export type TasteGraph = {
  source: "qloo" | "mock";
  synthetic: boolean;
  seeds: TasteEntity[];
  artists: TasteEntity[];
  places: TasteEntity[];
  brands: TasteEntity[];
  books: TasteEntity[];
  movies: TasteEntity[];
  /** Tags returned by `/v2/tags` or tag insights and kept because they match the prompt. */
  tags: TasteTag[];
  /** Entity ids actually sent as `signal.interests.entities`. */
  signalEntityIds: string[];
  /** Tag ids actually sent as `signal.interests.tags`. */
  signalTagIds: string[];
};

export type QlooTraceCall = {
  method: "GET";
  path: "/search" | "/v2/insights" | "/v2/tags";
  query: Record<string, string>;
  status: number;
  resultCount: number;
  mocked: boolean;
  error?: string;
};

export type InsightTarget =
  | "urn:entity:artist"
  | "urn:entity:place"
  | "urn:entity:brand"
  | "urn:entity:book"
  | "urn:entity:movie"
  | "urn:tag";

export interface TasteClient {
  readonly mode: "live" | "mock";
  readonly trace: QlooTraceCall[];
  search(query: string, take?: number): Promise<TasteEntity[]>;
  searchTags(query: string, take?: number): Promise<TasteTag[]>;
  insights(args: {
    filterType: InsightTarget;
    entityIds: string[];
    tagIds: string[];
    take?: number;
  }): Promise<{ entities: TasteEntity[]; tags: TasteTag[] }>;
}
