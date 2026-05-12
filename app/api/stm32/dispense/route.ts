import { NextResponse } from "next/server";
import { getStm32Config, stm32Dispense, stm32DispenseMany } from "@/utils/stm32";

export const runtime = "nodejs";

const IS_VERCEL = process.env.VERCEL === "1";

function getEnvNumber(name: string): number | undefined {
  const v = process.env[name];
  if (typeof v !== "string") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function getEnvString(name: string): string | undefined {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}

function getEnvBoolean(name: string): boolean {
  const v = getEnvString(name);
  if (!v) return false;
  const n = v.toLowerCase();
  return n === "1" || n === "true" || n === "yes";
}

function getRqMotorNumber(code: string): number | undefined {
  const trimmed = code.trim();
  const rq = trimmed.match(/^RQ\s*(\d+)$/i);
  if (rq) {
    const n = Number(rq[1]);
    return Number.isFinite(n) ? n : undefined;
  }

  // In our app, cart/checkout often sends raw slot IDs like "14".
  // Treat numeric-only codes as motor numbers as well.
  const numeric = trimmed.match(/^(\d+)$/);
  if (numeric) {
    const n = Number(numeric[1]);
    return Number.isFinite(n) ? n : undefined;
  }

  return undefined;
}

function getMotorColumn(motorNum: number): number {
  return ((motorNum % 10) + 10) % 10;
}

function getMotorRow(motorNum: number): number {
  return Math.floor(motorNum / 10);
}

function applySlotOffset(code: string, offset: number): string {
  if (!Number.isFinite(offset) || offset === 0) return code;
  const trimmed = code.trim();

  const rqMatch = trimmed.match(/^RQ\s*(\d+)$/i);
  if (rqMatch) {
    const n = Number(rqMatch[1]);
    if (!Number.isFinite(n)) return trimmed;
    return `RQ${n + offset}`;
  }

  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return trimmed;
    return String(n + offset);
  }

  return trimmed;
}

function removeSlotOffset(code: string, offset: number): string {
  if (!Number.isFinite(offset) || offset === 0) return code;
  const trimmed = code.trim();

  const rqMatch = trimmed.match(/^RQ\s*(\d+)$/i);
  if (rqMatch) {
    const n = Number(rqMatch[1]);
    if (!Number.isFinite(n)) return trimmed;
    return `RQ${n - offset}`;
  }

  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return trimmed;
    return String(n - offset);
  }

  return trimmed;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as
      | {
          productCode?: string;
          productCodes?: string[];
        }
      | null;

    if (!body) {
      return NextResponse.json(
        { success: false, error: { message: "Invalid JSON body" } },
        { status: 400 }
      );
    }

    const cfg = getStm32Config();

    const codes: string[] = Array.isArray(body.productCodes)
      ? body.productCodes
      : typeof body.productCode === "string"
        ? [body.productCode]
        : [];

    const slotOffset = getEnvNumber("STM32_SLOT_ID_OFFSET") ?? 0;

    const normalized = codes
      .map((c) => (typeof c === "string" ? applySlotOffset(c, slotOffset) : ""))
      .filter((c) => c.length > 0);

    if (normalized.length === 0) {
      return NextResponse.json(
        { success: false, error: { message: "Missing productCode(s)" } },
        { status: 400 }
      );
    }

    const results: Array<{
      productCode: string;
      ok: boolean;
      okLine?: string;
      errorLine?: string;
      rawLines: string[];
    }> = [];

    let sentCommands: string[] = [];

    // Firmware (`requestMotorSequence` in sketch_may25.ino) runs a FULL self-contained
    // cycle for every RQ<slot> command: home -> travel -> spin motor -> travel to door
    // -> doorOpen -> Serial.println(200) -> 15s hold -> doorClose -> home.
    // So we simply send RQ<slot> per item, sequentially. No TRAY/REOPEN needed.
    const delayBetweenCommandsMs = getEnvNumber("STM32_DELAY_BETWEEN_COMMANDS_MS") ?? 0;

    const rqOkPattern = /^200$/;
    const rqErrorPattern = /^(500|501)$|^ERROR\b/i;

    // Normalize each code to RQ<n>
    const expanded: string[] = normalized.map((c) => {
      const trimmed = c.trim();
      if (/^RQ\s*\d+$/i.test(trimmed)) return trimmed.toUpperCase().replace(/\s+/g, "");
      if (/^\d+$/.test(trimmed)) return `RQ${trimmed}`;
      return trimmed;
    });

    sentCommands = [...expanded];
    console.log("[STM32 Dispense] Sending sequential RQ commands:", expanded);

    const batch = await stm32DispenseMany(cfg, expanded, {
      commandPrefix: "",
      okPattern: rqOkPattern,
      errorPattern: rqErrorPattern,
      delayBetweenCommandsMs,
    });

    for (const { productCode, result: res } of batch) {
      results.push({
        productCode,
        ok: Boolean(res.okLine) && !res.errorLine,
        okLine: res.okLine,
        errorLine: res.errorLine,
        rawLines: res.rawLines,
      });
    }

    const success = results.every((r) => r.ok);

    if (success && !IS_VERCEL) {
      try {
        const { adminDb } = await import("@/lib/admin-db");

        // Only decrement for actual product dispense commands; ignore TRAY.
        const slotCodes = sentCommands.filter((c) => String(c).trim().toUpperCase() !== "TRAY");

        // Decrement each code by 1 (or by the number of times it appears).
        const counts = new Map<number, number>();
        for (const code of slotCodes) {
          const originalCode = removeSlotOffset(String(code), slotOffset);
          const motor = getRqMotorNumber(originalCode);
          if (!motor) continue;
          counts.set(motor, (counts.get(motor) ?? 0) + 1);
        }

        counts.forEach((qty, slotId) => {
          adminDb.updateSlotQuantity(slotId, -qty);
          console.log(`[STM32] Decremented slot ${slotId} by ${qty} after successful dispense`);
        });
      } catch (e) {
        console.warn("[STM32] Dispense succeeded but failed to decrement slot inventory:", e);
      }
    }

    return NextResponse.json({
      success,
      data: {
        sentCommands,
        results,
      },
    });
  } catch (err: any) {
    const message =
      typeof err?.message === "string" && err.message.trim().length > 0
        ? err.message
        : "Failed to dispense";

    const statusCode = message.startsWith("Missing env") || message.startsWith("Invalid env") ? 500 : 500;

    return NextResponse.json(
      {
        success: false,
        error:
          process.env.NODE_ENV === "production"
            ? { message }
            : {
                message,
                raw: {
                  name: err?.name,
                  stack: err?.stack,
                },
              },
      },
      { status: statusCode }
    );
  }
}
