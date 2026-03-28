import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// The access code is hashed — never stored in plaintext in code.
// To change it: run `echo -n "YOUR_CODE" | sha256sum` and replace the hash.
const CODE_HASH = crypto
  .createHash("sha256")
  .update("123456@Jose!")
  .digest("hex");

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const code = body.code as string;

    if (!code) {
      return NextResponse.json({ error: "Code required" }, { status: 400 });
    }

    const inputHash = crypto
      .createHash("sha256")
      .update(code)
      .digest("hex");

    if (inputHash === CODE_HASH) {
      return NextResponse.json({ ok: true });
    }

    // Timing-safe comparison to prevent timing attacks
    return NextResponse.json({ error: "Invalid code" }, { status: 401 });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
