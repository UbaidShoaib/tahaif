"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth.store";
import { loyaltyApi, type LoyaltyLedgerEntry, type LoyaltyWalletRead } from "@/lib/loyalty";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function LoyaltyPage() {
  const { accessToken, isLoading: authLoading } = useAuthStore();
  const [wallet, setWallet] = useState<LoyaltyWalletRead | null>(null);
  const [ledger, setLedger] = useState<LoyaltyLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!accessToken) {
      setLoading(false);
      return;
    }
    Promise.all([
      loyaltyApi.getWallet(accessToken),
      loyaltyApi.getLedger(accessToken),
    ])
      .then(([w, l]) => {
        setWallet(w);
        setLedger(l);
      })
      .catch(() => setError("Failed to load loyalty data. Please try again."))
      .finally(() => setLoading(false));
  }, [accessToken, authLoading]);

  if (authLoading || loading) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground">Loading loyalty points…</p>
      </div>
    );
  }

  if (!accessToken) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold mb-4">Loyalty Points</h1>
        <p className="text-muted-foreground mb-6">Please sign in to view your points.</p>
        <Link
          href="/login"
          className="inline-block bg-[#16a34a] text-white px-6 py-2 rounded-lg font-medium hover:bg-[#15803d] transition-colors"
        >
          Sign In
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Loyalty Points</h1>

      {/* Wallet summary */}
      {wallet && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="border rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-[#16a34a]">{wallet.balance_points}</p>
            <p className="text-xs text-muted-foreground mt-1">Available</p>
          </div>
          <div className="border rounded-xl p-4 text-center">
            <p className="text-3xl font-bold">{wallet.lifetime_earned}</p>
            <p className="text-xs text-muted-foreground mt-1">Earned</p>
          </div>
          <div className="border rounded-xl p-4 text-center">
            <p className="text-3xl font-bold">{wallet.lifetime_burned}</p>
            <p className="text-xs text-muted-foreground mt-1">Redeemed</p>
          </div>
        </div>
      )}

      {/* Earning info */}
      <div className="bg-[#16a34a]/5 border border-[#16a34a]/20 rounded-xl p-4 mb-8 text-sm">
        <p className="font-semibold text-[#16a34a] mb-1">How to earn points</p>
        <p className="text-muted-foreground">
          Earn <strong>1 point</strong> for every <strong>PKR 100</strong> you spend. Points are
          credited automatically when you place an order.
        </p>
      </div>

      {/* Ledger */}
      <h2 className="text-lg font-semibold mb-3">Transaction History</h2>
      {ledger.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-8">
          No transactions yet. Place an order to earn your first points!
        </p>
      ) : (
        <ul className="space-y-2">
          {ledger.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between border rounded-lg px-4 py-3 text-sm"
            >
              <div>
                <p className="font-medium">{entry.reason}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDate(entry.created_at)}
                </p>
              </div>
              <span
                className={`font-semibold ${
                  entry.delta_points > 0 ? "text-[#16a34a]" : "text-destructive"
                }`}
              >
                {entry.delta_points > 0 ? "+" : ""}
                {entry.delta_points} pts
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
