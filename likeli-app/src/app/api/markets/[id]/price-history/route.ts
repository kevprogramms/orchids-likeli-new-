import { NextResponse } from "next/server";
import { getPriceHistory } from "@/lib/orderbook";

interface Params {
    params: { marketId: string };
}

export async function GET(_req: Request, { params }: Params) {
    try {
        const p = await params;
        const points = getPriceHistory(p.marketId);
        const payload = points.map((p) => ({
            t: Math.floor(p.timestamp / 1000),
            yesProb: p.yesProb,
            noProb: p.noProb,
        }));
        return NextResponse.json({ points: payload });
    } catch (err) {
        console.error("price-history GET error", err);
        return NextResponse.json(
            { error: "INTERNAL_ERROR" },
            { status: 500 }
        );
    }
}
