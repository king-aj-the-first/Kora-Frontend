"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useWallet } from "./useWallet";
import {
  rpc,
  submitTransaction,
  sequenceManager,
  BadSequenceError,
} from "@/lib/stellar/client";
import * as StellarSdk from "@stellar/stellar-sdk";

export type TxLifecycleStatus =
  | "idle"
  | "building"
  | "simulating"
  | "signing"
  | "submitting"
  | "retrying"
  | "polling"
  | "confirmed"
  | "failed";

interface TxState {
  status: TxLifecycleStatus;
  txHash?: string;
  error?: string;
}

const TOAST_ID = "kora-tx";
const MAX_POLL_ATTEMPTS = 30;
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

const STAGE_MESSAGES: Record<TxLifecycleStatus, string> = {
  idle: "",
  building: "Building transaction…",
  simulating: "Simulating transaction…",
  signing: "Waiting for wallet signature…",
  submitting: "Submitting to Stellar network…",
  retrying: "Syncing sequence number and retrying…",
  polling: "Waiting for confirmation…",
  confirmed: "Transaction confirmed!",
  failed: "Transaction failed",
};

async function pollWithBackoff(hash: string): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    if (Date.now() > deadline) throw new Error("Transaction timed out after 5 minutes");

    const result = await rpc.getTransaction(hash);
    if (result.status === "SUCCESS") return hash;
    if (result.status === "FAILED") throw new Error("Transaction failed on-chain");

    // Exponential backoff: 1s, 2s, 4s, 8s … capped at 16s
    const delay = Math.min(1000 * 2 ** attempt, 16_000);
    await new Promise((r) => setTimeout(r, delay));
  }

  throw new Error(`Transaction not confirmed after ${MAX_POLL_ATTEMPTS} attempts`);
}

/**
 * Build, simulate, sign and submit a Soroban transaction.
 * Returns the signed XDR string.
 */
async function buildAndSign(
  buildFn: () => Promise<string>,
  signTransaction: (xdr: string) => Promise<string>,
  setStage: (status: TxLifecycleStatus) => void
): Promise<string> {
  setStage("building");
  const unsignedXdr = await buildFn();

  // Simulate only for real (non-mock) transactions
  if (!unsignedXdr.startsWith("mock_")) {
    setStage("simulating");
    const tx = StellarSdk.TransactionBuilder.fromXDR(
      unsignedXdr,
      process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE || StellarSdk.Networks.TESTNET
    );
    const sim = await rpc.simulateTransaction(tx);
    if (StellarSdk.rpc.Api.isSimulationError(sim)) {
      throw new Error(`Simulation failed: ${sim.error}`);
    }
  }

  setStage("signing");
  return signTransaction(unsignedXdr);
}

export function useTransaction() {
  const [state, setState] = useState<TxState>({ status: "idle" });
  const { signTransaction, publicKey } = useWallet();

  const setStage = useCallback((status: TxLifecycleStatus, extra?: Partial<TxState>) => {
    setState((s) => ({ ...s, status, ...extra }));
    if (status !== "idle" && status !== "confirmed" && status !== "failed") {
      toast.loading(STAGE_MESSAGES[status], { id: TOAST_ID });
    }
  }, []);

  const execute = useCallback(
    async (
      buildFn: () => Promise<string>,
      options?: {
        onSuccess?: (hash: string) => void;
        successMessage?: string;
        onError?: (err: unknown) => void;
      }
    ): Promise<string | null> => {
      try {
        // ── Phase 1: build + simulate + sign ──────────────────────────────
        let signedXdr = await buildAndSign(buildFn, signTransaction, setStage);

        // ── Phase 2: submit (with one seq-reset retry) ─────────────────────
        setStage("submitting");
        let hash: string;

        if (signedXdr.startsWith("mock_")) {
          await new Promise((r) => setTimeout(r, 800));
          hash = Array.from({ length: 64 }, () =>
            Math.floor(Math.random() * 16).toString(16)
          ).join("");
        } else {
          try {
            const result = await submitTransaction(signedXdr);
            if (result.status === "ERROR") throw new Error("Transaction submission failed");
            hash = result.hash;
          } catch (err) {
            if (err instanceof BadSequenceError && publicKey) {
              // Reset the local sequence counter from the authoritative network
              // value, rebuild the transaction with the corrected sequence, and
              // retry exactly once. The user never sees this — it's transparent.
              setStage("retrying");
              await sequenceManager.reset(publicKey);

              setStage("building");
              signedXdr = await buildAndSign(buildFn, signTransaction, setStage);

              setStage("submitting");
              const retryResult = await submitTransaction(signedXdr);
              if (retryResult.status === "ERROR") {
                throw new Error("Transaction submission failed after sequence reset");
              }
              hash = retryResult.hash;
            } else {
              throw err;
            }
          }
        }

        // ── Phase 4: poll for confirmation ─────────────────────────────────
        setStage("polling", { txHash: hash });
        if (!signedXdr.startsWith("mock_")) {
          await pollWithBackoff(hash);
        } else {
          await new Promise((r) => setTimeout(r, 1000));
        }

        // ── Phase 5: done ──────────────────────────────────────────────────
        setState({ status: "confirmed", txHash: hash });
        toast.success(options?.successMessage ?? "Transaction confirmed!", {
          id: TOAST_ID,
          description: `Hash: ${hash.slice(0, 16)}…`,
        });

        options?.onSuccess?.(hash);
        return hash;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Transaction failed";
        setState({ status: "failed", error: message });
        toast.error("Transaction failed", {
          id: TOAST_ID,
          description: message,
          action: { label: "Retry", onClick: () => setState({ status: "idle" }) },
        });
        options?.onError?.(err);
        return null;
      }
    },
    [signTransaction, publicKey, setStage]
  );

  const reset = useCallback(() => setState({ status: "idle" }), []);

  return {
    execute,
    reset,
    status: state.status,
    txHash: state.txHash,
    error: state.error,
  };
}
