export const getConversionMeta = (conversion = {}) => {
    const sourceCurrency = conversion.source_currency || (Number(conversion.sar_amount || 0) > 0 ? 'SAR' : 'AED');
    const targetCurrency = conversion.target_currency || (sourceCurrency === 'SAR' ? 'AED' : 'INR');
    const sourceAmount = sourceCurrency === 'SAR'
        ? Number(conversion.sar_amount || 0)
        : Number(conversion.aed_amount || 0);
    const targetAmount = targetCurrency === 'AED'
        ? Number(conversion.aed_amount || 0)
        : Number(conversion.profit_inr || 0);
    const rate = sourceCurrency === 'SAR' ? conversion.sar_rate : conversion.aed_rate;

    return { sourceCurrency, targetCurrency, sourceAmount, targetAmount, rate };
};

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const getEventTime = (record = {}) => {
    const parsed = Date.parse(record.$createdAt || record.createdAt || record.date || '');
    return Number.isFinite(parsed) ? parsed : 0;
};

const getAgentCurrencyKey = (agentId, currency) => `${agentId || ''}::${currency || ''}`;

export const buildConversionSourceDebitMap = (conversions = [], expenses = []) => {
    const events = [];

    expenses.forEach(expense => {
        if (expense.category !== 'Conversion Fund Ops') return;
        if (!expense.distributor_id || !expense.currency) return;

        const amount = Number(expense.amount || 0);
        if (amount <= 0) return;

        events.push({
            kind: 'fund',
            key: getAgentCurrencyKey(expense.distributor_id, expense.currency),
            amount: expense.type === 'income' ? -amount : amount,
            time: getEventTime(expense),
            order: 0,
            id: expense.$id || '',
        });
    });

    conversions.forEach(conversion => {
        const meta = getConversionMeta(conversion);
        if (!conversion.$id || !conversion.conversion_agent_id || !meta.sourceCurrency || meta.sourceAmount <= 0) return;

        events.push({
            kind: 'conversion',
            key: getAgentCurrencyKey(conversion.conversion_agent_id, meta.sourceCurrency),
            conversionId: conversion.$id,
            amount: meta.sourceAmount,
            time: getEventTime(conversion),
            order: 1,
            id: conversion.$id,
        });
    });

    events.sort((a, b) => (
        a.time - b.time
        || a.order - b.order
        || String(a.id).localeCompare(String(b.id))
    ));

    const fundedBalances = new Map();
    const sourceDebitByConversionId = new Map();

    events.forEach(event => {
        const currentFunded = fundedBalances.get(event.key) || 0;

        if (event.kind === 'fund') {
            fundedBalances.set(event.key, Math.max(0, round2(currentFunded + event.amount)));
            return;
        }

        const fundedAmount = Math.min(currentFunded, event.amount);
        const unfundedSourceAmount = round2(event.amount - fundedAmount);

        fundedBalances.set(event.key, Math.max(0, round2(currentFunded - fundedAmount)));
        sourceDebitByConversionId.set(event.conversionId, unfundedSourceAmount);
    });

    return sourceDebitByConversionId;
};
