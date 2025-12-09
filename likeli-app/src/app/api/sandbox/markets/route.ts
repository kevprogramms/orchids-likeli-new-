
import { NextRequest, NextResponse } from "next/server";
import { sandboxMarkets, SandboxMarket, createSandboxCurve, recordSandboxPriceSnapshot } from "@/lib/sandbox";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { question, category, resolutionDate, initialLiquidityUsd, rules } = body;

        if (!question || !initialLiquidityUsd) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const baseLiquidity = parseFloat(initialLiquidityUsd);
        const id = `sb_${crypto.randomUUID().slice(0, 8)}`;

        // Use helper for dynamic maxSupply
        const curve = createSandboxCurve(baseLiquidity);

        const newMarket: SandboxMarket = {
            id,
            question,
            category: category || "General",
            resolutionDate,
            rules: rules || "",
            phase: "sandbox_curve",
            initialLiquidityUsd: baseLiquidity,
            curve,
            priceHistory: [],
            // Compatibility fields
            volume: 0,
            creatorId: "demo-user", // mocked
            graduated: false
        };

        // Initial snapshot
        recordSandboxPriceSnapshot(newMarket);

        sandboxMarkets.set(newMarket.id, newMarket);

        return NextResponse.json(newMarket);

    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json(Array.from(sandboxMarkets.values()));
}
