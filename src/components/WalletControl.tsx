import { useEffect, useState } from "react";
import {
  useConnection,
  useConnect,
  useDisconnect,
  useSignMessage,
  useSwitchChain,
} from "wagmi";
import { verifyMessage } from "wagmi/actions";
import { recoverMessageAddress } from "viem";
import { sepolia } from "wagmi/chains";
import { OPEN_IN, shortAddress, walletConfig } from "../lib/wallet";
import { Modal } from "./Modal";
import { Icon } from "./Icon";

export function WalletControl({
  verified,
  onIdentity,
}: {
  verified: string | undefined;
  onIdentity: (address?: string) => void;
}) {
  const { address, isConnected, chainId } = useConnection();
  const {
    connectors,
    mutate: connect,
    isPending,
    variables,
    reset,
  } = useConnect();
  const { mutate: disconnect } = useDisconnect();
  const { mutateAsync: signMessage, isPending: signing } = useSignMessage();
  const { mutateAsync: switchChain, isPending: switching } = useSwitchChain();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const mobile =
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (matchMedia("(pointer: coarse)").matches && innerWidth < 900);
  const named = connectors.some(
    (c) => c.type === "injected" && c.id !== "injected",
  );
  const listed = [
    ...connectors.filter((c) => c.type === "injected"),
    ...connectors.filter((c) => c.type !== "injected"),
  ].filter((c) => !(c.id === "injected" && named));
  const hasExtension =
    named || Boolean((window as unknown as { ethereum?: unknown }).ethereum);
  useEffect(() => {
    if (
      !address ||
      (verified && verified.toLowerCase() !== address.toLowerCase())
    )
      onIdentity(undefined);
  }, [address, verified, onIdentity]);

  async function sign() {
    if (!address) return;
    setNote("");
    try {
      const identity = address;
      const nonce = crypto.randomUUID();
      const message = `Squeek Relay\n\nUse ${identity} as my leaderboard identity on ${location.origin}.\nThis signature is free and authorizes no transactions or token approvals.\n\nNonce: ${nonce}\nIssued at: ${new Date().toISOString()}`;
      const signature = await signMessage({ message });
      let valid = false;
      try {
        valid =
          (
            await recoverMessageAddress({ message, signature })
          ).toLowerCase() === identity.toLowerCase();
      } catch {
        /* Smart accounts are verified through ERC-1271 / ERC-6492 below. */
      }
      if (!valid)
        valid = await verifyMessage(walletConfig, {
          address: identity,
          message,
          signature,
        });
      if (!valid) throw new Error("Signature did not match");
      onIdentity(identity);
      setOpen(false);
    } catch {
      setNote(
        "Signature not completed. Try again, or close this and play as a guest.",
      );
    }
  }
  return (
    <>
      <button
        className="wallet-control secondary"
        onClick={() => {
          setOpen(true);
          setNote("");
        }}
      >
        <Icon name="wallet" size={18} />
        <span>
          {isConnected && address ? shortAddress(address) : "Connect wallet"}
        </span>
        {verified && <Icon name="check" size={16} />}
      </button>
      {open && (
        <Modal
          title={isConnected ? "Your runner identity" : "Connect a wallet"}
          onClose={() => {
            setOpen(false);
            reset();
          }}
          className="wallet-sheet"
        >
          <p className="muted modal-intro">
            Optional. Sign one free message to put your address beside scores on
            this device.
          </p>
          {isConnected && address ? (
            <div className="identity-panel">
              <p className="address">{address}</p>
              {verified ? (
                <p className="success-note">
                  <Icon name="check" />
                  Identity signed for this visit
                </p>
              ) : chainId !== sepolia.id ? (
                <button
                  className="primary"
                  disabled={switching}
                  onClick={() => {
                    setNote("");
                    void switchChain({ chainId: sepolia.id }).catch(() =>
                      setNote(
                        "Network switch not completed. Try again or play as a guest.",
                      ),
                    );
                  }}
                >
                  {switching ? "Switching…" : "Switch to Sepolia"}
                </button>
              ) : (
                <button
                  className="primary"
                  onClick={() => {
                    void sign();
                  }}
                  disabled={signing}
                >
                  {signing ? "Check your wallet…" : "Sign free message"}
                  <Icon name="arrow" />
                </button>
              )}
              <button
                className="secondary full"
                onClick={() => {
                  onIdentity(undefined);
                  disconnect({});
                  setNote("");
                }}
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div className="wallet-rows">
              {mobile &&
                !hasExtension &&
                OPEN_IN.map((w) => (
                  <a
                    key={w.id}
                    href={w.href(location.href)}
                    className="wallet-row"
                  >
                    <img
                      src={`${import.meta.env.BASE_URL}wallets/${w.id}.svg`}
                      width="28"
                      height="28"
                      alt=""
                    />
                    <span>Open in {w.name}</span>
                    <Icon name="link" size={16} />
                  </a>
                ))}
              {listed
                .filter(
                  (c) => !(mobile && !hasExtension && c.type === "injected"),
                )
                .map((c) => (
                  <button
                    key={c.uid}
                    className="wallet-row"
                    disabled={isPending}
                    onClick={() => {
                      setNote("");
                      connect(
                        { connector: c },
                        {
                          onError: () =>
                            setNote(
                              "Wallet did not connect. Try again, or play as a guest.",
                            ),
                        },
                      );
                    }}
                  >
                    {c.icon ? (
                      <img src={c.icon} width="28" height="28" alt="" />
                    ) : c.id === "coinbaseWalletSDK" ? (
                      <img
                        src={`${import.meta.env.BASE_URL}wallets/coinbase.svg`}
                        width="28"
                        height="28"
                        alt=""
                      />
                    ) : (
                      <Icon name="wallet" size={28} />
                    )}
                    <span>
                      {c.id === "injected"
                        ? "Browser wallet"
                        : c.id === "coinbaseWalletSDK"
                          ? mobile
                            ? "Coinbase Smart Wallet"
                            : "Coinbase Wallet"
                          : c.name}
                      {isPending && variables?.connector === c
                        ? " · opening…"
                        : ""}
                    </span>
                    <Icon name="right" size={16} />
                  </button>
                ))}
            </div>
          )}
          <p className="wallet-note">
            No gas. No payments. Your guest runner is always ready.
          </p>
          <p role="status" className="error-note">
            {note}
          </p>
        </Modal>
      )}
    </>
  );
}
