/**
 * Stellar/Soroban RPC client singleton.
 * Reads network config from environment variables.
 */
import * as StellarSdk from "@stellar/stellar-sdk";

const RPC_URL =
  process.env.NEXT_PUBLIC_STELLAR_RPC_URL || "https://soroban-testnet.stellar.org";

const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE ||
  StellarSdk.Networks.TESTNET;

const HORIZON_URL =
  process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL ||
  "https://horizon-testnet.stellar.org";

// Soroban RPC client
export const rpc = new StellarSdk.rpc.Server(RPC_URL, { allowHttp: false });

// Horizon server (for account info, balances)
export const horizon = new StellarSdk.Horizon.Server(HORIZON_URL);

export const networkConfig = {
  rpcUrl: RPC_URL,
  networkPassphrase: NETWORK_PASSPHRASE,
  horizonUrl: HORIZON_URL,
};

// ─── Sequence Manager ─────────────────────────────────────────────────────────

/**
 * Per-address optimistic sequence number manager.
 *
 * Problem: when two transactions are built back-to-back before the first one
 * is confirmed, both calls to rpc.getAccount() return the same *committed*
 * sequence number → both transactions use seq+1 → collision (tx_bad_seq).
 *
 * Solution: maintain a local counter per wallet address that increments
 * optimistically on every build. On tx_bad_seq failure the counter is
 * reset from the live network and the caller retries once.
 *
 * Concurrent-tab safety: a reset always wins over the local counter because
 * it fetches the authoritative value from the network.
 */
export class SequenceManager {
  // address → current local sequence number (as string to match StellarSdk)
  private readonly counters = new Map<string, bigint>();
  // address → in-progress reset promise (deduplicate concurrent resets)
  private readonly resetPromises = new Map<string, Promise<bigint>>();

  /**
   * Returns a StellarSdk.Account whose sequence number is the next value to
   * use. Increments the local counter optimistically so the next caller gets
   * seq+1 without waiting for network confirmation.
   */
  async nextAccount(address: string): Promise<StellarSdk.Account> {
    if (!this.counters.has(address)) {
      // First use for this address — fetch from network and seed the counter.
      await this.fetchAndSeed(address);
    }

    const seq = this.counters.get(address)!;
    // Increment before returning so the *next* concurrent call gets seq+1.
    this.counters.set(address, seq + 1n);

    // StellarSdk.Account constructor takes the *current* (pre-increment) seq
    // and internally adds 1 when building. So we pass seq (not seq+1).
    return new StellarSdk.Account(address, seq.toString());
  }

  /**
   * Reset the local counter from the network (authoritative value).
   * Called after a tx_bad_seq error. Deduplicates concurrent calls so a
   * flurry of failures only triggers one network request.
   */
  async reset(address: string): Promise<void> {
    await this.fetchAndSeed(address);
  }

  /**
   * Explicitly evict a counter (e.g. on wallet disconnect).
   */
  evict(address: string): void {
    this.counters.delete(address);
    this.resetPromises.delete(address);
  }

  // ── private ────────────────────────────────────────────────────────────────

  private async fetchAndSeed(address: string): Promise<bigint> {
    // Deduplicate: if a reset is already in-flight for this address, wait for
    // it instead of launching a second network request.
    const existing = this.resetPromises.get(address);
    if (existing) return existing;

    const promise = rpc
      .getAccount(address)
      .then((account) => {
        const seq = BigInt(account.sequenceNumber());
        this.counters.set(address, seq);
        return seq;
      })
      .finally(() => {
        this.resetPromises.delete(address);
      });

    this.resetPromises.set(address, promise);
    return promise;
  }
}

/** Module-level singleton — shared across all callers in this tab. */
export const sequenceManager = new SequenceManager();

// ─── Account / balance helpers ────────────────────────────────────────────────

/**
 * Fetch account details from Horizon.
 */
export async function getAccount(publicKey: string) {
  return horizon.loadAccount(publicKey);
}

/**
 * Fetch XLM + token balances for a given account.
 */
export async function getAccountBalances(publicKey: string) {
  const account = await horizon.loadAccount(publicKey);
  const balances: Record<string, string> = {};

  for (const b of account.balances) {
    if (b.asset_type === "native") {
      balances["XLM"] = b.balance;
    } else if (b.asset_type === "credit_alphanum4" || b.asset_type === "credit_alphanum12") {
      balances[b.asset_code] = b.balance;
    }
  }

  return balances;
}

// ─── Transaction submission ───────────────────────────────────────────────────

/** Error thrown when the network rejects a transaction due to a bad sequence number. */
export class BadSequenceError extends Error {
  constructor() {
    super("tx_bad_seq");
    this.name = "BadSequenceError";
  }
}

/** Returns true if a Soroban RPC send result represents a tx_bad_seq failure. */
export function isBadSeqResult(
  result: StellarSdk.rpc.Api.SendTransactionResponse
): boolean {
  if (result.status !== "ERROR") return false;
  // The error extras may contain result codes; check common shapes.
  const extras = (result as unknown as { errorResultXdr?: string; extras?: { result_codes?: { transaction?: string } } }).extras;
  const txCode = extras?.result_codes?.transaction ?? "";
  // Also check errorResultXdr for tx_bad_seq if present
  const xdr = (result as unknown as { errorResultXdr?: string }).errorResultXdr ?? "";
  return txCode === "tx_bad_seq" || xdr.includes("txBAD_SEQ");
}

/**
 * Submit a signed XDR transaction to the Soroban RPC.
 * Throws BadSequenceError when the network returns tx_bad_seq so the caller
 * can reset the sequence counter and retry.
 */
export async function submitTransaction(
  signedXdr: string
): Promise<StellarSdk.rpc.Api.SendTransactionResponse> {
  const tx = StellarSdk.TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  const result = await rpc.sendTransaction(tx);

  if (isBadSeqResult(result)) {
    throw new BadSequenceError();
  }

  return result;
}

/**
 * Poll for transaction confirmation.
 */
export async function waitForTransaction(
  hash: string,
  maxAttempts = 30,
  intervalMs = 2000
): Promise<StellarSdk.rpc.Api.GetTransactionResponse> {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await rpc.getTransaction(hash);
    if (result.status !== "NOT_FOUND") return result;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Transaction ${hash} not confirmed after ${maxAttempts} attempts`);
}

