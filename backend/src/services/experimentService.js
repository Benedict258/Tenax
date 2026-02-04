const crypto = require('crypto');

const parseVariants = () => {
  const raw = process.env.EXPERIMENT_VARIANTS || 'control';
  const variants = raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  return variants.length ? variants : ['control'];
};

const parseWeights = (count) => {
  const raw = process.env.EXPERIMENT_WEIGHTS;
  if (!raw) return Array(count).fill(1 / count);
  const values = raw
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isFinite(v) && v >= 0);
  if (values.length !== count) return Array(count).fill(1 / count);
  const total = values.reduce((sum, v) => sum + v, 0) || 1;
  return values.map((v) => v / total);
};

const pickVariant = (userId, variants, weights) => {
  if (!userId) return variants[0];
  const hash = crypto.createHash('md5').update(String(userId)).digest('hex');
  const bucket = parseInt(hash.slice(0, 8), 16) / 0xffffffff;
  let cumulative = 0;
  for (let i = 0; i < variants.length; i += 1) {
    cumulative += weights[i];
    if (bucket <= cumulative) return variants[i];
  }
  return variants[variants.length - 1];
};

function assignVariant(userId) {
  const experimentId = process.env.EXPERIMENT_ID || 'control';
  const variants = parseVariants();
  const weights = parseWeights(variants.length);
  const variant = pickVariant(userId, variants, weights);
  return { experimentId, variant };
}

module.exports = {
  assignVariant
};
