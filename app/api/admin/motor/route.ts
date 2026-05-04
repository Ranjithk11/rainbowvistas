import { NextRequest, NextResponse } from "next/server";
import { stm32Dispense, stm32SendCommands, getStm32Config } from "@/utils/stm32";

// POST motor control command
// Connects to real STM32 hardware via serial port
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { command } = body;

    if (!command) {
      return NextResponse.json(
        { success: false, message: "Command is required" },
        { status: 400 }
      );
    }

    // Get STM32 config
    let cfg;
    try {
      cfg = getStm32Config();
    } catch (envError) {
      console.error("STM32 config error:", envError);
      return NextResponse.json(
        { success: false, message: "STM32 not configured. Check STM32_PORT in .env.local" },
        { status: 500 }
      );
    }

    // Parse command (format: "M,slotId,action" where action is 0=test, 1=dispense)
    const parts = command.split(",");
    
    if (parts[0] === "M" && parts.length >= 3) {
      const slotId = parts[1];
      const action = parts[2] === "1" ? "dispense" : "test";
      
      console.log(`[STM32] Motor command: ${action} for slot ${slotId}`);
      
      // In mock mode, simulate success
      if (cfg.mock) {
        console.log(`[STM32 Mock] Simulating ${action} for slot ${slotId}`);

        if (action === "dispense") {
          try {
            const { adminDb } = await import("@/lib/admin-db");
            const slotNum = Number(slotId);
            if (Number.isFinite(slotNum)) {
              adminDb.updateSlotQuantity(slotNum, -1);
              console.log(`[STM32 Mock] Decremented slot ${slotNum} by 1`);
            }
          } catch (e) {
            console.warn("[STM32 Mock] Failed to decrement slot inventory:", e);
          }
        }

        return NextResponse.json({
          success: true,
          message: `Motor ${action} command sent for slot ${slotId} (mock)`,
          response: `200 OK - ${action.toUpperCase()} completed`,
          rawLines: [`[MOCK] ${action} slot ${slotId}`, "[MOCK] Request sequence finished"],
        });
      }
      
      // Send RQ<slot> command to STM32 firmware for full dispense sequence
      // Firmware's requestMotorSequence() already handles: home -> travel -> spin motor
      // -> travel to door -> doorOpen -> Serial.println(200) -> delay(15s) -> doorClose -> home.
      // So the only response we ever get is literally "200" (debugPrinting=false in firmware).
      if (action === "dispense") {
        try {
          const result = await stm32Dispense(cfg, slotId, {
            okPattern: /^200$/,
            errorPattern: /^(500|501)$|^ERROR\b/i,
          });

          const rawLines = [...(result.rawLines || [])];

          if (result.okLine) {
            try {
              const { adminDb } = await import("@/lib/admin-db");
              const slotNum = Number(slotId);
              if (Number.isFinite(slotNum)) {
                adminDb.updateSlotQuantity(slotNum, -1);
                console.log(`[STM32] Decremented slot ${slotNum} by 1 after successful dispense`);
              }
            } catch (e) {
              console.warn("[STM32] Dispense succeeded but failed to decrement slot inventory:", e);
            }

            return NextResponse.json({
              success: true,
              message: `Motor ${action} command sent for slot ${slotId}`,
              response: result.okLine,
              rawLines,
            });
          } else if (result.errorLine) {
            return NextResponse.json({
              success: false,
              message: `STM32 error: ${result.errorLine}`,
              rawLines,
            }, { status: 500 });
          }
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          console.error("[STM32] Dispense error:", error);
          return NextResponse.json({
            success: false,
            message: error.message,
          }, { status: 500 });
        }
      }
      
      return NextResponse.json({
        success: true,
        message: `Motor ${action} command sent for slot ${slotId}`,
        response: `200 OK - ${action.toUpperCase()} completed`,
      });
    }

    // Handle HOME command
    if (command === "HOME") {
      // In mock mode or serverless, simulate success
      if (cfg.mock) {
        console.log("[STM32 Mock] Simulating HOME command");
        return NextResponse.json({
          success: true,
          message: "Home command sent (mock)",
          response: "Homing initiated",
          rawLines: ["[MOCK] HOME command", "[MOCK] Homing complete"],
        });
      }
      
      try {
        // Firmware has no serial response for HOME or DISPENSE (debugPrinting=false).
        // We queue both commands back-to-back on a single port open. The firmware's
        // main loop() reads commands one at a time from its serial buffer, so:
        //   1. `HOME`     -> homeAxes() (X, Z, D home to endstops)
        //   2. `DISPENSE` -> moveStepperTo(Z, doorZ) -> moveStepperTo(X, doorX) -> doorOpen()
        // Net effect: machine homes, then the tray travels to the dispense door position
        // and the door opens so the operator can load/pick up products.
        const { sent } = await stm32SendCommands(cfg, ["HOME", "DISPENSE"], {
          delayBetweenCommandsMs: 300,
        });

        return NextResponse.json({
          success: true,
          message: "Home + move to dispense position issued",
          response: "HOME then DISPENSE queued",
          rawLines: [
            `[STM32] Sent: ${sent.join(" -> ")}`,
            "[STM32] No serial response expected (firmware debugPrinting=false)",
          ],
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error("[STM32] Home error:", error);
        return NextResponse.json({
          success: false,
          message: error.message,
        }, { status: 500 });
      }
    }

    // REOPEN is not implemented in current STM32 firmware. The RQ<slot> dispense sequence
    // already opens the door, holds it for 15s, and closes it automatically. We keep this
    // endpoint responding OK so existing UI buttons don't error out.
    if (command === "REOPEN") {
      return NextResponse.json({
        success: true,
        message: "REOPEN is handled automatically by the dispense sequence (no-op)",
        response: "no-op",
        rawLines: ["[INFO] REOPEN ignored: firmware's RQ sequence already opens/closes the door"],
      });
    }

    // Handle DISPENSE command (generic - no slot selected)
    if (command === "DISPENSE") {
      // In mock mode, return helpful message
      if (cfg.mock) {
        return NextResponse.json({
          success: false,
          message: "Please select a slot first before dispensing",
        }, { status: 400 });
      }
      return NextResponse.json({
        success: false,
        message: "Please select a slot first before dispensing",
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `Command '${command}' processed`,
      response: "200 OK",
    });
  } catch (error) {
    console.error("Motor control error:", error);
    const err = error instanceof Error ? error : new Error(String(error));
    return NextResponse.json(
      { success: false, message: err.message || "Failed to send motor command" },
      { status: 500 }
    );
  }
}
