const variantConfig = {
  agentVersion: process.env.AGENT_VERSION || 'v1.0',
  experimentId: process.env.EXPERIMENT_ID || 'control'
};

module.exports = variantConfig;
