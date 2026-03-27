import { NextRequest, NextResponse } from "next/server";
import { callClaude } from "@/lib/services/claude/client";
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
    const action = body.action;
    const VALID_ACTIONS = ["activate", "deactivate", "duplicate", "restore", "test"] as const;

    if (!action || !VALID_ACTIONS.includes(action)) {
      return NextResponse.json(
        { error: `Invalid action. Valid: ${VALID_ACTIONS.join(", ")}` },
        { status: 400 }
      );
    }

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
        const systemPrompt = prompt.systemPrompt
          ? renderTemplate(prompt.systemPrompt, variables)
          : "You are a trading analyst. Respond with valid JSON.";
        const rendered = renderTemplate(prompt.userPromptTemplate, variables);

        let response: string;
        try {
          const claudeResult = await callClaude({
            systemPrompt,
            userPrompt: rendered,
          });
          response = claudeResult.content;
        } catch (err) {
          // Fallback to rendered prompt preview if Claude not available
          response = JSON.stringify({
            _test_error: err instanceof Error ? err.message : "Claude API unavailable",
            _rendered_prompt: rendered.slice(0, 500),
          }, null, 2);
        }
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
