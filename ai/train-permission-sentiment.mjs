import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const datasetPath = fileURLToPath(
  new URL('./training-data/permission-reasons.json', import.meta.url),
);
const modelPath = fileURLToPath(
  new URL('./model-permission-reason.json', import.meta.url),
);
const dataset = JSON.parse(readFileSync(datasetPath, 'utf8'));
const labels = ['negatif', 'netral', 'positif'];
const aliases = {
  gak: 'tidak',
  nggak: 'tidak',
  ga: 'tidak',
  gk: 'tidak',
  enggak: 'tidak',
};
const preprocessing =
  'unicode_nfkd_ascii_words_unigram_bigram_sublinear_tf_l2_v1';

function tokenize(text) {
  const normalized = text
    .replace(/<[^>]*>/g, ' ')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return (normalized.match(/[a-z0-9]+/g) || []).map(
    (word) => aliases[word] ?? word,
  );
}

function getFeatureCounts(text, vocabulary) {
  const words = tokenize(text);
  const grams = words.concat(
    words.slice(1).map((word, index) => `${words[index]} ${word}`),
  );
  const counts = new Map();

  for (const gram of grams) {
    const index = vocabulary.get(gram);
    if (index !== undefined) {
      counts.set(index, (counts.get(index) ?? 0) + 1);
    }
  }

  return counts;
}

function vectorize(text, vocabulary, idf) {
  const counts = getFeatureCounts(text, vocabulary);
  const values = [...counts].map(([index, count]) => [
    index,
    (1 + Math.log(count)) * idf[index],
  ]);
  const norm = Math.sqrt(
    values.reduce((sum, [, value]) => sum + value ** 2, 0),
  );

  return norm > 0
    ? values.map(([index, value]) => [index, value / norm])
    : [];
}

function buildVectorizer(rows) {
  const vocabulary = new Map();
  const documentFrequencies = [];

  for (const row of rows) {
    const words = tokenize(row.text);
    const grams = words.concat(
      words.slice(1).map((word, index) => `${words[index]} ${word}`),
    );
    const seen = new Set(grams);

    for (const gram of seen) {
      if (!vocabulary.has(gram)) {
        vocabulary.set(gram, vocabulary.size);
        documentFrequencies.push(0);
      }
      documentFrequencies[vocabulary.get(gram)] += 1;
    }
  }

  const idf = documentFrequencies.map(
    (frequency) => Math.log((1 + rows.length) / (1 + frequency)) + 1,
  );

  return { vocabulary, idf };
}

function train(rows) {
  const { vocabulary, idf } = buildVectorizer(rows);
  const weights = labels.map(() => Array(vocabulary.size).fill(0));
  const bias = labels.map(() => 0);
  const examples = rows.map((row) => ({
    label: labels.indexOf(row.label),
    vector: vectorize(row.text, vocabulary, idf),
  }));
  const epochs = 2500;
  const learningRate = 0.15;
  const regularization = 0.01;

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    const weightGradient = labels.map(() => Array(vocabulary.size).fill(0));
    const biasGradient = labels.map(() => 0);

    for (const example of examples) {
      const scores = labels.map((_, classIndex) =>
        example.vector.reduce(
          (score, [featureIndex, value]) =>
            score + weights[classIndex][featureIndex] * value,
          bias[classIndex],
        ),
      );
      const maxScore = Math.max(...scores);
      const expScores = scores.map((score) => Math.exp(score - maxScore));
      const expTotal = expScores.reduce((sum, score) => sum + score, 0);

      for (let classIndex = 0; classIndex < labels.length; classIndex += 1) {
        const probability = expScores[classIndex] / expTotal;
        const error = probability - Number(classIndex === example.label);
        biasGradient[classIndex] += error;

        for (const [featureIndex, value] of example.vector) {
          weightGradient[classIndex][featureIndex] += error * value;
        }
      }
    }

    for (let classIndex = 0; classIndex < labels.length; classIndex += 1) {
      bias[classIndex] -=
        (learningRate * biasGradient[classIndex]) / examples.length;

      for (let featureIndex = 0; featureIndex < vocabulary.size; featureIndex += 1) {
        const gradient =
          weightGradient[classIndex][featureIndex] / examples.length +
          regularization * weights[classIndex][featureIndex];
        weights[classIndex][featureIndex] -= learningRate * gradient;
      }
    }
  }

  return { vocabulary, idf, weights, bias };
}

function predict(text, model) {
  const vector = vectorize(text, model.vocabulary, model.idf);
  if (vector.length === 0) return null;

  const scores = labels.map((_, classIndex) =>
    vector.reduce(
      (score, [featureIndex, value]) =>
        score + model.weights[classIndex][featureIndex] * value,
      model.bias[classIndex],
    ),
  );

  return labels[scores.indexOf(Math.max(...scores))];
}

if (
  dataset.length === 0 ||
  dataset.some(
    (row) =>
      typeof row.text !== 'string' ||
      !labels.includes(row.label) ||
      row.text.trim().length === 0,
  )
) {
  throw new Error('Dataset harus berisi teks dan label sentimen yang valid.');
}

const trainingRows = dataset.filter((_, index) => index % 5 !== 0);
const validationRows = dataset.filter((_, index) => index % 5 === 0);
const validationModel = train(trainingRows);
const validationErrors = validationRows.filter(
  (row) => predict(row.text, validationModel) !== row.label,
);
const validationCorrect = validationRows.length - validationErrors.length;
const finalModel = train(dataset);
const vocabularyObject = Object.fromEntries(finalModel.vocabulary);

const output = {
  schema_version: 1,
  status: 'prototype_synthetic_not_practicum_validated',
  algorithm: 'SoftmaxRegression',
  labels,
  aliases,
  vocabulary: vocabularyObject,
  idf: finalModel.idf,
  weights: finalModel.weights,
  bias: finalModel.bias,
  preprocessing,
  training_data:
    'Synthetic informal Indonesian permission justification examples; prototype only',
};

writeFileSync(modelPath, `${JSON.stringify(output)}\n`);

console.log(`Examples: ${dataset.length} (${labels.length} labels)`);
console.log(
  `Holdout accuracy: ${validationCorrect}/${validationRows.length} (${Math.round((validationCorrect / validationRows.length) * 100)}%)`,
);
for (const row of validationErrors) {
  console.log(
    `  expected ${row.label}, predicted ${predict(row.text, validationModel)}: ${row.text}`,
  );
}
console.log(`Vocabulary: ${finalModel.vocabulary.size} features`);
console.log(`Wrote ${modelPath}`);
