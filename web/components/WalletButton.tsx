"use client";

import {
  useConnect,
  useConnection,
  useConnectors,
  useDisconnect,
  useSwitchChain,
} from "wagmi";

import { chainName, targetChainId } from "@/lib/deployments";
import { shortAddress } from "@/lib/format";

export function WalletButton() {
  const { address, isConnected, chainId } = useConnection();
  const connectors = useConnectors();
  const { mutate: connect, isPending: isConnecting } = useConnect();
  const { mutate: disconnect } = useDisconnect();
  const { mutate: switchChain, isPending: isSwitching } = useSwitchChain();

  const injectedConnector = connectors[0];
  const wrongChain = isConnected && chainId !== targetChainId;

  if (!isConnected) {
    return (
      <button
        type="button"
        className="btn btn-primary"
        disabled={!injectedConnector || isConnecting}
        onClick={() =>
          injectedConnector && connect({ connector: injectedConnector })
        }
      >
        {isConnecting ? "Connecting..." : "Connect wallet"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {wrongChain && (
        <button
          type="button"
          className="btn btn-primary"
          disabled={isSwitching}
          onClick={() => switchChain({ chainId: targetChainId })}
        >
          {isSwitching
            ? "Switching..."
            : `Switch to ${chainName(targetChainId)}`}
        </button>
      )}
      <button
        type="button"
        className="btn btn-ghost mono"
        onClick={() => disconnect()}
        title="Disconnect"
      >
        {address ? shortAddress(address) : "Connected"}
      </button>
    </div>
  );
}
