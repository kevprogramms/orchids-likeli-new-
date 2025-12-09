
import { NextRequest, NextResponse } from "next/server";
import { sandboxMarkets, getProbability } from "@/lib/sandbox";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const market = sandboxMarkets.get(id);

    if (!market) {
        return NextResponse.json({ error: "Market not found" }, { status: 404 });
    }

    const currentPrices = getProbability(market);

    return NextResponse.json({ ...market, currentPrices });
}

