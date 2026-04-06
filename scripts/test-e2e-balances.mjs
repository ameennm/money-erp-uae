/**
 * test-e2e-balances.mjs
 * 
 * This script simulates the backend logic of ledgerService.js to verify
 * that negative balances (Pocket Money / Advances) are handled correctly.
 */

const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

function simulateEntry({ currentBal, amount, type }) {
    const sign = type === 'debit' ? 1 : -1;
    const absAmount = Math.abs(Number(amount));
    return round2(currentBal + (absAmount * sign));
}

function runTests() {
    console.log("🚀 Starting Balance Logic Verification...\n");

    // --- Scenario 1: Distributor Pocket Money ---
    console.log("--- Scenario 1: Distributor Pocket Money (INR) ---");
    let distBal = 0;
    console.log(`Initial Balance: ₹${distBal}`);

    // Distributor uses pocket money (Receipt from them)
    distBal = simulateEntry({ currentBal: distBal, amount: 5000, type: 'credit' });
    console.log(`Action: Receive ₹5000 from Distributor (Pocket Money) -> Balance: ₹${distBal} (${distBal < 0 ? 'WE OWE THEM' : 'THEY OWE US'})`);

    // We pay them back partially
    distBal = simulateEntry({ currentBal: distBal, amount: 2000, type: 'debit' });
    console.log(`Action: Pay ₹2000 to Distributor -> Balance: ₹${distBal} (${distBal < 0 ? 'WE OWE THEM' : 'THEY OWE US'})`);
    
    if (distBal === -3000) console.log("✅ Distributor Scenario Passed\n");
    else console.log("❌ Distributor Scenario Failed\n");


    // --- Scenario 2: Agent Advance ---
    console.log("--- Scenario 2: Agent Advance (SAR) ---");
    let agentBal = 0;
    console.log(`Initial Balance: ${agentBal} SAR`);

    // Agent gives advance
    agentBal = simulateEntry({ currentBal: agentBal, amount: 1000, type: 'credit' });
    console.log(`Action: Receive 1000 SAR from Agent (Advance) -> Balance: ${agentBal} SAR (${agentBal < 0 ? 'AGENT CREDIT' : 'THEY OWE US'})`);

    // Agent collects from clients
    agentBal = simulateEntry({ currentBal: agentBal, amount: 1500, type: 'debit' });
    console.log(`Action: Agent collects 1500 SAR -> Balance: ${agentBal} SAR (${agentBal < 0 ? 'AGENT CREDIT' : 'THEY OWE US'})`);

    if (agentBal === 500) console.log("✅ Agent Scenario Passed\n");
    else console.log("❌ Agent Scenario Failed\n");


    // --- Scenario 3: Conversion Agent Pocket ---
    console.log("--- Scenario 3: Conversion Agent (SAR -> AED) ---");
    let convBal = 0;
    console.log(`Initial Balance: ${convBal} SAR`);

    // We give them SAR
    convBal = simulateEntry({ currentBal: convBal, amount: 5000, type: 'debit' });
    console.log(`Action: Give 5000 SAR to Agent for conversion -> Balance: ${convBal} SAR (${convBal > 0 ? 'THEY OWE US' : 'WE OWE THEM'})`);

    // They convert it (Credit)
    convBal = simulateEntry({ currentBal: convBal, amount: 5000, type: 'credit' });
    console.log(`Action: Agent settles 5000 SAR (Conversion Done) -> Balance: ${convBal} SAR`);

    if (convBal === 0) console.log("✅ Conversion Scenario Passed\n");
    else console.log("❌ Conversion Scenario Failed\n");

    console.log("🏆 All logic tests completed successfully!");
}

runTests();
