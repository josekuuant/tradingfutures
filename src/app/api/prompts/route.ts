import { NextRequest, NextResponse } from "next/server";
import { listPrompts, createPrompt } from "@/lib/services/prompts";
import { createPromptSchema } from "@/types/prompt";
import { ZodError } from "zod";

export async function GET() {
  try {
    const prompts = await listPrompts();
    return NextResponse.json(prompts);
  } catch (err) {
    console.error("[API] GET /prompts error:", err);
    return NextResponse.json({ error: "Failed to load prompts" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = createPromptSchema.parse(body);
    const prompt = await createPrompt(data);
    return NextResponse.json(prompt, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: err.flatten().fieldErrors },
        { status: 400 }
      );
    }
    console.error("[API] POST /prompts error:", err);
    return NextResponse.json({ error: "Failed to create prompt" }, { status: 500 });
  }
}
