export const isCollectionAgent = (agent = {}) => {
    const type = agent.type || 'collection';
    return type === 'collection' || type.startsWith('collection_');
};

export const isDistributorAgent = (agent = {}) => agent.type === 'distributor';

export const isConversionAgent = (agent = {}) => {
    const type = agent.type || '';
    return type === 'conversion' || type === 'conversion_sar' || type === 'conversion_aed';
};
