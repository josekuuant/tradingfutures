import { NextRequest, NextResponse } from "next/server";
import {
  getAllConnections,
  upsertConnection,
} from "@/lib/services/connections";
import { updateConnectionSchema } from "@/types/connections";
import { ZodError } from "zod";

export async function GET() {
  try {
    const connections = await getAllConnections();
    return NextResponse.json(connections);
  } catch (err) {
    console.error("[API] GET /connections error:", err);
    return NextResponse.json(
      { error: "Failed to load connections" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const payload = updateConnectionSchema.parse(body);
    const result = await upsertConnection(payload);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: err.flatten().fieldErrors },
        { status: 400 }
      );
    }
    console.error("[API] PUT /connections error:", err);
    return NextResponse.json(
      { error: "Failed to save connection" },
      { status: 500 }
    );
  }
}
