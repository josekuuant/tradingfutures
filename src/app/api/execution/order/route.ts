import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { placeOrder, confirmOrder } from "@/lib/services/execution";

const orderRequestSchema = z.object({
  instrument: z.string().min(1),
  side: z.enum(["buy", "sell"]),
  type: z.enum(["market", "limit", "stop", "stop_limit"]).default("market"),
  quantity: z.number().int().min(1).max(100),
  price: z.number().positive().optional(),
  stopPrice: z.number().positive().optional(),
  confirm: z.boolean().optional().default(false),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { confirm, ...request } = orderRequestSchema.parse(body);

    const result = confirm
      ? await confirmOrder(request)
      : await placeOrder(request);

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error,
          errorCode: result.errorCode,
          requiresApproval: result.requiresApproval ?? false,
          dryRun: result.dryRun ?? false,
        },
        { status: result.requiresApproval ? 200 : 400 }
      );
    }

    return NextResponse.json(result.order, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: err.flatten().fieldErrors },
        { status: 400 }
      );
    }
    console.error("[API] POST /execution/order error:", err);
    return NextResponse.json(
      { error: "Order placement failed" },
      { status: 500 }
    );
  }
}
