import { NextResponse } from "next/server";
import { getOrderbook } from "@/lib/orderbook";

interface Params {
    params: { marketId: string };
}

export async function GET(_req: Request, { params }: Params) {
    try {
        const p = await params;
        const data = getOrderbook(p.marketId);
        return NextResponse.json(data);
    } catch (err) {
        console.error("orderbook GET error", err);
        return NextResponse.json(
            { error: "INTERNAL_ERROR" },
            { status: 500 }
        );
    }
}
