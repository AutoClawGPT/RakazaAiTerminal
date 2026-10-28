"use client";
import { LaunchFlow } from "@/components/launch/launch-flow";
import type { LaunchApi } from "@/components/launch/launch-api";
import { vampScanAction } from "@/app/(dash)/scanner/actions";
import { imageAction, launchAction } from "@/app/(dash)/launch/actions";
import { autoAnalyzeAction, autoPinAction, autoPrepareAction, autoRiskAction, autoTrustAction } from "@/app/(dash)/launch/auto-actions";
import { ledgerAction } from "@/app/(dash)/history/actions";

/** Owner-only wiring of the shared launch pipeline: the SPONSORED agent launcher. The treasury agent wallet pays; the fee wallet gets 70%. */
const API: LaunchApi = {
  scan: vampScanAction,
  analyze: autoAnalyzeAction,
  risk: autoRiskAction,
  image: imageAction,
  pin: autoPinAction,
  trust: autoTrustAction,
  prepare: autoPrepareAction,
  launch: launchAction,
  ledger: ledgerAction,
};

export function AgentLaunch(p: { treasury?: string; network: "devnet" | "mainnet-beta"; executeBlockedReason: string; initialWallet?: string }) {
  return <LaunchFlow variant="sponsored" api={API} {...p} />;
}
