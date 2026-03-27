import { NextRequest, NextResponse } from "next/server";
import { placeOrder, confirmOrder } from "@/lib/services/execution";
import type { OrderRequest } from "@/types/execution";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const confirm = body.confirm === true;

    const request: OrderRequest = {
      instrument: body.instrument,
      side: body.side,
      type: body.type ?? "market",
      quantity: body.quantity,
      price: body.price,
      stopPrice: body.stopPrice,
    };

    if (!request.instrument || !request.side || !request.quantity) {
      return NextResponse.json(
        { error: "instrument, side, and quantity are required" },
        { status: 400 }
      );
    }

    const result = confirm
      ? await confirmOrder(request)
      : await placeOrder(request);

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error,
          requiresConfirmation: result.requiresConfirmation ?? false,
        },
        { status: result.requiresConfirmation ? 200 : 400 }
      );
    }

    return NextResponse.json(result.order, { status: 201 });
  } catch (err) {
    console.error("[API] POST /execution/order error:", err);
    return NextResponse.json(
      { error: "Order placement failed" },
      { status: 500 }
    );
  }
}
