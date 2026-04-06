import { dbService } from './appwrite';

const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

export const ledgerService = {
    /**
     * Records a new ledger entry and updates the agent's running balance.
     * @param {Object} params
     * @param {string} params.agent_id
     * @param {string} params.agent_name
     * @param {number} params.amount - Positive for credit, negative for debit
     * @param {string} params.currency - 'INR', 'SAR', or 'AED'
     * @param {string} params.type - 'credit' or 'debit'
     * @param {string} params.reference_type - e.g. 'transaction', 'expense'
     * @param {string} params.reference_id - The ID of the related object
     * @param {string} params.description - Human readable description
     */
    async recordEntry({ agent_id, agent_name, amount, currency, type, reference_type, reference_id, description, agent = null }) {
        if (!agent_id && !agent) throw new Error('agent_id or agent is required for ledger entry');

        const targetId = agent_id || agent.$id;
        const targetName = agent_name || agent.name;
        const targetType = agent?.type || 'collection';

        // 1. ALWAYS get current agent from DB to ensure absolute latest balance
        const targetAgent = await dbService.getAgent(targetId);
        if (!targetAgent) throw new Error(`Agent ${targetId} not found`);

        const balField = currency === 'INR' ? 'inr_balance' : (currency === 'SAR' ? 'sar_balance' : 'aed_balance');
        const currentBal = round2(targetAgent[balField] || 0);

        // Debit increases balance (agent owes more), Credit decreases it (agent paid/distributed)
        const sign = type === 'debit' ? 1 : -1;
        const absAmount = Math.abs(Number(amount));
        const newBal = round2(currentBal + (absAmount * sign));

        // 2. Create the ledger entry
        const entry = await dbService.createLedgerEntry({
            agent_id: targetId,
            agent_name: targetName,
            agent_type: targetType,
            amount: absAmount,
            currency,
            type,
            reference_type,
            reference_id,
            description,
            running_balance: newBal,
        });

        // 3. Update the agent's running balance
        await dbService.updateAgent(targetId, { [balField]: newBal });

        return entry;
    },

    /**
     * Reverses a ledger entry (e.g. when a transaction is deleted)
     */
    async reverseEntry(reference_id, reference_type, descriptionPrefix = 'REVERSED: ') {
        // Find the entry to reverse
        const entries = await dbService.listLedgerEntries();
        const relatedEntries = entries.documents.filter(e => e.reference_id === reference_id && e.reference_type === reference_type);

        for (const entry of relatedEntries) {
            await this.recordEntry({
                agent_id: entry.agent_id,
                agent_name: entry.agent_name,
                amount: entry.amount,
                currency: entry.currency,
                type: entry.type === 'credit' ? 'debit' : 'credit',
                reference_type: entry.reference_type,
                reference_id: entry.reference_id,
                description: `${descriptionPrefix}${entry.description}`
            });
        }
    }
};
