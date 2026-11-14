import model from '../../ai/model-permission-reason.json';
import { createSentimentClassifier } from '../../ai/sentiment';

import type { PermissionAiPrediction } from '@/types';

const classify = createSentimentClassifier(model);

export function classifyPermissionReason(
  reason: string,
): PermissionAiPrediction {
  try {
    const prediction = classify(reason.trim());

    return {
      label:
        prediction.label === 'positif' ||
        prediction.label === 'netral' ||
        prediction.label === 'negatif'
          ? prediction.label
          : null,
      status: prediction.status,
      experimental: prediction.experimental,
      scoreType: prediction.scoreType,
      modelVersion: 'permission-reason-v1',
    };
  } catch {
    return {
      label: null,
      status: 'error',
      experimental: true,
      scoreType: 'none',
      modelVersion: 'permission-reason-v1',
    };
  }
}
