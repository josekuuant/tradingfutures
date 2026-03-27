import { NextRequest, NextResponse } from "next/server";
import {
  getPrompt,
  updatePrompt,
  deletePrompt,
  duplicatePrompt,
  activatePrompt,
  deactivatePrompt,
  listVersions,
  restoreVersion,
  listTestRuns,
  saveTestRun,
  renderTemplate,
} from "@/lib/services/prompts";
import { updatePromptSchema } from "@/types/prompt";
import { ZodError } from "zod";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(req.url);
    const include = searchParams.get("include");

    const prompt = await getPrompt(params.id);
    if (!prompt) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const result: Record<string, unknown> = { ...prompt };

    if (include?.includes("versions")) {
      result.versions = await listVersions(params.id);
    }
    if (include?.includes("testRuns")) {
      result.testRuns = await listTestRuns(params.id);
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[API] GET /prompts/[id] error:", err);
    return NextResponse.json({ error: "Failed to load prompt" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const data = updatePromptSchema.parse(body);
    const prompt = await updatePrompt(params.id, data);
    if (!prompt) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(prompt);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: err.flatten().fieldErrors },
        { status: 400 }
      );
    }
    console.error("[API] PUT /prompts/[id] error:", err);
    return NextResponse.json({ error: "Failed to update prompt" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const deleted = await deletePrompt(params.id);
    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[API] DELETE /prompts/[id] error:", err);
    return NextResponse.json({ error: "Failed to delete prompt" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const action = body.action as string;

    let result;
    switch (action) {
      case "activate":
        result = await activatePrompt(params.id);
        break;
      case "deactivate":
        result = await deactivatePrompt(params.id);
        break;
      case "duplicate":
        result = await duplicatePrompt(params.id);
        break;
      case "restore": {
        const versionId = body.versionId as string;
        if (!versionId) {
          return NextResponse.json({ error: "versionId required" }, { status: 400 });
        }
        result = await restoreVersion(params.id, versionId);
        break;
      }
      case "test": {
        const variables = (body.variables ?? {}) as Record<string, string>;
        const prompt = await getPrompt(params.id);
        if (!prompt) {
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        const start = Date.now();
        const rendered = renderTemplate(prompt.userPromptTemplate, variables);

        // Mock response — will be replaced with real Claude call
        const response = JSON.stringify(
          {
            action: "NO_TRADE",
            confidence: 0,
            reasoning: "This is a test render. Connect Claude API for real analysis.",
            entry_price: null,
            stop_loss: null,
            take_profit: null,
            risk_reward_ratio: null,
          },
          null,
          2
        );
        const durationMs = Date.now() - start;

        const testRun = await saveTestRun(
          params.id,
          variables,
          rendered,
          response,
          durationMs
        );
        return NextResponse.json(testRun);
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("[API] PATCH /prompts/[id] error:", err);
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
