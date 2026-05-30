import type { Invoice, SMEProfile, InvestorProfile } from "@/types";

function seededRandom(seed: number) {
  return function () {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}

const jurisdictions = ["US", "EU", "UK", "NG", "KE", "GH", "ZA", "OTHER"] as const;
const categories = [
  "technology",
  "manufacturing",
  "logistics",
  "healthcare",
  "retail",
  "construction",
  "agriculture",
  "energy",
] as const;
const statuses = ["listed", "partially_funded", "fully_funded", "active", "repaid", "defaulted"] as const;
const riskTiers = ["AAA", "AA", "A", "BBB", "BB", "B", "CCC"] as const;

function pick<T>(rng: () => number, arr: readonly T[]) {
  return arr[Math.floor(rng() * arr.length)];
}

export function generateMockInvoices(count = 50, seed = 42): Invoice[] {
  const rng = seededRandom(seed);
  const invoices: Invoice[] = [];
  for (let i = 1; i <= count; i++) {
    const amount = Math.round((1000 + rng() * 499000));
    const financingPct = 0.5 + rng() * 0.45; // 50-95%
    const financingAmount = Math.round(amount * financingPct);
    const totalRaised = Math.round(financingAmount * rng());
    const fundingProgress = Math.min(1, totalRaised / financingAmount || 0);
    const inv: Invoice = {
      id: `inv_${String(i).padStart(3, "0")}`,
      tokenId: `${i}`,
      contractAddress: "CA-MOCK-CONTRACT",
      ipfsCid: `QmMock${i}`,
      metadata: {
        invoiceNumber: `INV-2025-${1000 + i}`,
        issuerName: `SME ${i}`,
        issuerAddress: `ADDR_${i}`,
        debtorName: `Debtor ${i}`,
        debtorAddress: `Debtor Address ${i}`,
        amount,
        currency: "USDC",
        issueDate: new Date(Date.now() - Math.floor(rng() * 60) * 24 * 3600 * 1000).toISOString().slice(0, 10),
        dueDate: new Date(Date.now() + Math.floor(30 + rng() * 180) * 24 * 3600 * 1000).toISOString().slice(0, 10),
        description: `Invoice for ${pick(rng, categories)} services`,
        jurisdiction: pick(rng, jurisdictions) as any,
        category: pick(rng, categories) as any,
        documentHash: `QmMockDoc${i}`,
        documentUrl: `https://example.com/doc/${i}`,
      },
      terms: {
        discountRate: Number((0.02 + rng() * 0.12).toFixed(3)),
        apr: Number((10 + rng() * 40).toFixed(2)),
        financingAmount,
        minInvestment: Math.round(100 + rng() * 10000),
        maxInvestment: Math.round(1000 + rng() * 200000),
        tenor: Math.round(30 + rng() * 360),
        repaymentDate: new Date(Date.now() + Math.round(30 + rng() * 360) * 24 * 3600 * 1000).toISOString().slice(0, 10),
      },
      funding: {
        totalRaised,
        targetAmount: financingAmount,
        fundingProgress,
        investorCount: Math.max(0, Math.round(rng() * 120)),
        remainingCapacity: Math.max(0, financingAmount - totalRaised),
      },
      riskTier: pick(rng, riskTiers) as any,
      riskScore: Math.round(30 + rng() * 70),
      status: pick(rng, statuses) as any,
      createdAt: new Date(Date.now() - Math.round(rng() * 90) * 24 * 3600 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
      ownerAddress: `WALLET_SME_${Math.ceil(rng() * 10)}`,
    };
    invoices.push(inv);
  }
  return invoices;
}

export function generateSMEProfiles(count = 10, invoices: Invoice[], seed = 101): SMEProfile[] {
  const rng = seededRandom(seed);
  const profiles: SMEProfile[] = [];
  for (let i = 1; i <= count; i++) {
    const myInv = invoices.filter((inv) => inv.ownerAddress === `WALLET_SME_${i}`);
    const totalFinanced = myInv.reduce((s, inv) => s + inv.funding.totalRaised, 0);
    profiles.push({
      id: `sme_${i}`,
      walletAddress: `WALLET_SME_${i}`,
      role: "sme",
      displayName: `SME ${i}`,
      companyName: `SME Company ${i}`,
      email: `sme${i}@example.com`,
      kycStatus: "verified",
      createdAt: new Date(Date.now() - Math.round(rng() * 400) * 24 * 3600 * 1000).toISOString(),
      jurisdiction: pick(rng, jurisdictions) as any,
      totalInvoicesCreated: myInv.length,
      totalFinanced,
      repaymentRate: Number((0.8 + rng() * 0.2).toFixed(2)),
    });
  }
  return profiles;
}

export function generateInvestorProfiles(count = 10, invoices: Invoice[], seed = 202): InvestorProfile[] {
  const rng = seededRandom(seed);
  const profiles: InvestorProfile[] = [];
  for (let i = 1; i <= count; i++) {
    const positions = [] as any[];
    const investCount = Math.max(1, Math.round(rng() * 12));
    let totalInvested = 0;
    for (let j = 0; j < investCount; j++) {
      const inv = invoices[Math.floor(rng() * invoices.length)];
      const amt = Math.round(Math.min(inv.funding.targetAmount - inv.funding.totalRaised, 1000 + rng() * 50000));
      totalInvested += Math.abs(amt);
      positions.push({ invoiceId: inv.id, investedAmount: Math.max(100, Math.round(amt)) });
    }
    profiles.push({
      id: `inv_${i}`,
      walletAddress: `WALLET_INV_${i}`,
      role: "investor",
      displayName: `Investor ${i}`,
      companyName: `Investor ${i}`,
      email: `investor${i}@example.com`,
      kycStatus: "verified",
      createdAt: new Date(Date.now() - Math.round(rng() * 700) * 24 * 3600 * 1000).toISOString(),
      totalInvested,
      totalYieldEarned: Math.round(totalInvested * (0.02 + rng() * 0.12)),
      activePositions: positions.length,
      portfolioValue: totalInvested,
    });
  }
  return profiles;
}

export function generateTransactions(count = 100, invoices: Invoice[], seed = 303) {
  const rng = seededRandom(seed);
  const types = ["mint", "fund", "repay", "claim"];
  const transactions: any[] = [];
  for (let i = 0; i < count; i++) {
    const inv = invoices[Math.floor(rng() * invoices.length)];
    const type = pick(rng, types as any);
    const amount = Math.round((type === "fund" ? (100 + rng() * Math.min(50000, inv.metadata.amount)) : rng() * 10000));
    transactions.push({
      hash: `tx_${i}_${Math.round(rng() * 1e6)}`,
      type,
      status: rng() > 0.05 ? "confirmed" : "failed",
      invoiceNumber: inv.metadata.invoiceNumber,
      amount,
      currency: inv.metadata.currency,
      description: `${type} for ${inv.metadata.invoiceNumber}`,
      timestamp: new Date(Date.now() - Math.round(rng() * 90) * 24 * 3600 * 1000).toISOString(),
    });
  }
  return transactions;
}

export function generateAnalyticsSeries(days = 90, seed = 404) {
  const rng = seededRandom(seed);
  const now = new Date();
  const portfolio: { date: string; value: number }[] = [];
  const yieldSeries: { date: string; value: number }[] = [];
  const volume: { date: string; value: number }[] = [];
  let base = 1000000 + rng() * 500000;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 3600 * 1000);
    base = Math.max(50000, base + (rng() - 0.45) * 20000);
    const val = Math.round(base);
    portfolio.push({ date: d.toISOString().slice(0, 10), value: val });
    yieldSeries.push({ date: d.toISOString().slice(0, 10), value: Math.round((rng() * 5000)) });
    volume.push({ date: d.toISOString().slice(0, 10), value: Math.round(rng() * 200000) });
  }
  return { portfolio, yieldSeries, volume };
}

// Exports — generate with deterministic seeds so tests are stable
export const MOCK_INVOICES = generateMockInvoices(50, 12345);
export const MOCK_SMES = generateSMEProfiles(10, MOCK_INVOICES, 222);
export const MOCK_INVESTORS = generateInvestorProfiles(10, MOCK_INVOICES, 333);
export const MOCK_TRANSACTIONS = generateTransactions(100, MOCK_INVOICES, 444);
export const MOCK_ANALYTICS = generateAnalyticsSeries(90, 555);

