
import { NextRequest, NextResponse } from "next/server";
import { sandboxMarkets, sandboxUsers, buyCost, sellPayout, priceAtSupply, getProbability, recordSandboxPriceSnapshot, Outcome } from "@/lib/sandbox";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;

        console.log(`[Trade] Lookup ${id} in keys:`, Array.from(sandboxMarkets.keys()));
        const market = sandboxMarkets.get(id);

        if (!market) {
            return NextResponse.json({ error: "Market not found" }, { status: 404 });
        }

        const body = await req.json();
        console.log("Sandbox Trade API Received:", body);

        const { side, outcome, amountUsd, qty, userId } = body;
        // userId is optional from UI but needed for state
        const user = userId || "demo-user";

        if (!sandboxUsers.has(user)) {
            sandboxUsers.set(user, { id: user, cash: 10000, positions: {} });
        }
        const currentUser = sandboxUsers.get(user)!;

        // "outcome" in body is generic string, cast to known check
        const outcomeStr = String(outcome).toLowerCase();
        const isYes = outcomeStr === "yes";
        const curve = isYes ? market.curve.yes : market.curve.no;

        if (!curve) {
            return NextResponse.json({ error: "Invalid outcome" }, { status: 400 });
        }

        // Checklist Logic Implementation
        const step = 100; // token granularity
        let delta = 0;
        let cost = 0;
        let payout = 0;

        if (side === "BUY") {
            // "Use a simple numeric search for delta."
            while (true) {
                const nextDelta = delta + step;
                const c = buyCost(curve, nextDelta);
                if (c > amountUsd) break; // Stop if next step exceeds budget
                delta = nextDelta;
                cost = c;
            }

            // If delta is 0, user didn't have enough for 1 step? 
            if (delta <= 0) {
                // Try minimally 1 unit or return error
                if (amountUsd > 0) {
                    // Force at least something if they provided USD
                    // But strictly speaking, if 100 is step, maybe we should try smaller steps?
                    // Let's just try step=1 fallback
                    const cSmall = buyCost(curve, 1);
                    if (cSmall <= amountUsd) {
                        delta = 1;
                        cost = cSmall;
                    } else {
                        return NextResponse.json({ error: "Amount too small for min purchase" }, { status: 400 });
                    }
                } else {
                    return NextResponse.json({ error: "Amount required" }, { status: 400 });
                }
            }

            curve.supply += delta;
            curve.reserve += cost;

            // Safeguard: ensure cost is reasonable
            if (isNaN(cost) || !isFinite(cost) || cost < 0) {
                console.error('[Trade] Invalid cost calculated:', cost);
                cost = 0;
            }

            // Check user has enough balance before deducting
            if (currentUser.cash < cost) {
                return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
            }

            // Update user balance
            currentUser.cash -= cost;
            const posKey = `${market.id}-${isYes ? "yes" : "no"}`;
            currentUser.positions[posKey] = (currentUser.positions[posKey] || 0) + delta;

            console.log('[Trade] BUY completed:', { delta, cost, newBalance: currentUser.cash });

        } else {
            // SELL
            // "just sell as much as user supposedly has"

            // Respecting UI: if `qty` is sent (shares), use it.
            if (qty) {
                delta = qty;
            } else {
                // Fallback if only amountUsd provided (e.g. "receive up to X")
                // This is ambiguous for sell. Let's assume standard behavior: sell everything user has?
                // Or just fallback to 100 for demo.
                delta = 100;
            }

            const posKey = `${market.id}-${isYes ? "yes" : "no"}`;
            const currentShares = currentUser.positions[posKey] || 0;

            // Clamp
            if (delta > currentShares) delta = currentShares;
            if (delta <= 0) return NextResponse.json({ error: "Insufficient shares" }, { status: 400 });

            payout = sellPayout(curve, delta);

            // Validation
            if (payout > curve.reserve) payout = curve.reserve;

            curve.supply -= delta;
            curve.reserve -= payout;

            currentUser.cash += payout;
            currentUser.positions[posKey] -= delta;
        }

        // Recompute prices and update history
        recordSandboxPriceSnapshot(market);

        // DEBUG: Log curve state after trade
        console.log('[Trade DEBUG] After trade:', {
            side,
            outcome: outcomeStr,
            delta,
            cost: side === 'BUY' ? cost : payout,
            yesCurve: { supply: market.curve.yes.supply, reserve: market.curve.yes.reserve, maxSupply: market.curve.yes.maxSupply },
            noCurve: { supply: market.curve.no.supply, reserve: market.curve.no.reserve, maxSupply: market.curve.no.maxSupply },
            yesPrice: getProbability(market).yesPrice,
            noPrice: getProbability(market).noPrice,
            probYes: getProbability(market).probYes,
        });

        // Write back
        sandboxMarkets.set(id, market);
        sandboxUsers.set(user, currentUser);

        const currentPrices = getProbability(market);

        // Return updated state
        return NextResponse.json({
            market,
            position: currentUser.positions,
            currentPrices,
            userCash: currentUser.cash  // Return current balance
        });

    } catch (e) {
        console.error("Trade error:", e);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
