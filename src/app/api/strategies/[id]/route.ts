import { NextRequest, NextResponse } from "next/server";
import {
  getStrategy,
  updateStrategy,
  deleteStrategy,
  duplicateStrategy,
  activateStrategy,
  deactivateStrategy,
} from "@/lib/services/strategies";
import { updateStrategySchema } from "@/types/strategy";
import { ZodError } from "zod";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const strategy = await getStrategy(params.id);
    if (!strategy) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(strategy);
  } catch (err) {
    console.error("[API] GET /strategies/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to load strategy" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const data = updateStrategySchema.parse(body);
    const strategy = await updateStrategy(params.id, data);
    if (!strategy) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(strategy);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: err.flatten().fieldErrors },
        { status: 400 }
      );
    }
    console.error("[API] PUT /strategies/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to update strategy" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const deleted = await deleteStrategy(params.id);
    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[API] DELETE /strategies/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to delete strategy" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const action = body.action;
    const VALID_ACTIONS = ["activate", "deactivate", "duplicate"] as const;

    if (!action || !VALID_ACTIONS.includes(action)) {
      return NextResponse.json(
        { error: `Invalid action. Valid: ${VALID_ACTIONS.join(", ")}` },
        { status: 400 }
      );
    }

    let result;
    switch (action) {
      case "activate":
        result = await activateStrategy(params.id);
        break;
      case "deactivate":
        result = await deactivateStrategy(params.id);
        break;
      case "duplicate":
        result = await duplicateStrategy(params.id);
        break;
    }

    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("[API] PATCH /strategies/[id] error:", err);
    return NextResponse.json(
      { error: "Action failed" },
      { status: 500 }
    );
  }
}
