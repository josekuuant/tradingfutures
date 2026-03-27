import { NextRequest, NextResponse } from "next/server";
import {
  getProposedOrder,
  approveOrder,
  rejectOrder,
  cancelProposedOrder,
  markSubmitted,
  markFilled,
} from "@/lib/services/execution/order-queue";
import { placeOrder } from "@/lib/services/execution";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const order = getProposedOrder(params.id);
  if (!order) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(order);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const action = body.action;

    const VALID_ACTIONS = [
      "approve",
      "reject",
      "cancel",
      "approve_and_execute",
    ] as const;

    if (!action || !VALID_ACTIONS.includes(action)) {
      return NextResponse.json(
        { error: `Invalid action. Valid: ${VALID_ACTIONS.join(", ")}` },
        { status: 400 }
      );
    }

    let result;

    switch (action) {
      case "approve":
        result = approveOrder(params.id);
        break;

      case "reject":
        result = rejectOrder(params.id, body.reason ?? "Manually rejected");
        break;

      case "cancel":
        result = cancelProposedOrder(params.id);
        break;

      case "approve_and_execute": {
        // 1. Approve
        const approved = approveOrder(params.id);
        if (!approved) {
          return NextResponse.json(
            { error: "Order cannot be approved (wrong status)" },
            { status: 400 }
          );
        }

        // 2. Execute via unified layer
        const execResult = await placeOrder(
          {
            instrument: approved.instrument,
            side: approved.side,
            type: approved.type,
            quantity: approved.quantity,
            price: approved.price ?? undefined,
            stopPrice: approved.stopPrice ?? undefined,
            idempotencyKey: approved.id,
          },
          approved.provider
        );

        if (execResult.success && execResult.order) {
          markSubmitted(approved.id, execResult.order.id);
          if (execResult.order.status === "filled") {
            markFilled(
              approved.id,
              execResult.order.avgFillPrice ?? 0,
              execResult.order.filledQuantity
            );
          }
          result = getProposedOrder(approved.id);
        } else {
          rejectOrder(
            approved.id,
            execResult.error ?? "Execution failed"
          );
          result = getProposedOrder(approved.id);
        }
        break;
      }
    }

    if (!result) {
      return NextResponse.json(
        { error: "Order not found or invalid status transition" },
        { status: 400 }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[API] PATCH /execution/queue/[id] error:", err);
    return NextResponse.json(
      { error: "Action failed" },
      { status: 500 }
    );
  }
}
