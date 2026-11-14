export type SentimentModel = {
  schema_version: number;
  preprocessing: string;
  aliases: Record<string, string>;
  vocabulary: Record<string, number>;
  idf: number[];
  weights: number[][];
  bias: number[];
  labels: string[];
  algorithm: string;
  status?: string;
};

export type SentimentPrediction = {
  label: string | null;
  status: 'predicted' | 'unknown_vocabulary' | 'empty_input';
  scores: number[] | null;
  scoreType: 'none' | 'decision_margin' | 'log_score';
  experimental: boolean;
};

export function createSentimentClassifier(
  model: SentimentModel,
): (text: string) => SentimentPrediction;
