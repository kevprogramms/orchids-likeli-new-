import { NextResponse } from "next/server";
import { getUserPositions } from "@/lib/orderbook";

interface Params {
    params: { marketId: string };
}

export async function GET(req: Request, { params }: Params) {
    try {
        const p = await params;
        // For now, use ?userId=demo-user or hardcode "demo-user"
        const { searchParams } = new URL(req.url);
        const userId = searchParams.get("userId") ?? "demo-user";

        const positions = getUserPositions(userId, p.marketId);

        return NextResponse.json({ positions });
    } catch (err) {
        console.error("positions GET error", err);
        return NextResponse.json({ positions: [] }, { status: 500 });
    }
}
