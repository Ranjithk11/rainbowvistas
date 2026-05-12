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
        // Firmware's HOME command homes X, Z, D to their endstops and leaves the tray
        // parked at (0, 0). No serial response is emitted (debugPrinting=false), so we
        // fire-and-forget and return immediately.
        const { sent } = await stm32SendCommands(cfg, ["HOME"]);

        return NextResponse.json({
          success: true,
          message: "Home command issued",
          response: "HOME queued",
          rawLines: [
            `[STM32] Sent: ${sent.join(", ")}`,
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

    // Handle individual HOME commands for each axis
    if (command === "HOME_X" || command === "HOME_Z" || command === "HOME_D") {
      if (cfg.mock) {
        console.log(`[STM32 Mock] Simulating ${command}`);
        return NextResponse.json({
          success: true,
          message: `${command} command sent (mock)`,
          response: `${command} queued`,
          rawLines: [`[MOCK] ${command}`, "[MOCK] Axis homed"],
        });
      }

      try {
        const { sent } = await stm32SendCommands(cfg, [command]);
        return NextResponse.json({
          success: true,
          message: `${command} command issued`,
          response: `${command} queued`,
          rawLines: [
            `[STM32] Sent: ${sent.join(", ")}`,
            "[STM32] No serial response expected (firmware debugPrinting=false)",
          ],
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error(`[STM32] ${command} error:`, error);
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

    // Handle generic DISPENSE command (no slot selected).
    // Firmware's `DISPENSE` command moves Z -> doorZ, X -> doorX, then doorOpen().
    // Use this to park the tray at the dispense door (e.g. for loading / maintenance).
    if (command === "DISPENSE") {
      if (cfg.mock) {
        console.log("[STM32 Mock] Simulating DISPENSE (park at door)");
        return NextResponse.json({
          success: true,
          message: "Dispense position command sent (mock)",
          response: "Moving to dispense door",
          rawLines: ["[MOCK] DISPENSE", "[MOCK] Tray at door, door open"],
        });
      }

      try {
        const { sent } = await stm32SendCommands(cfg, ["DISPENSE"]);
        return NextResponse.json({
          success: true,
          message: "Tray moving to dispense door",
          response: "DISPENSE queued",
          rawLines: [
            `[STM32] Sent: ${sent.join(", ")}`,
            "[STM32] No serial response expected (firmware debugPrinting=false)",
          ],
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error("[STM32] Dispense (park) error:", error);
        return NextResponse.json({
          success: false,
          message: error.message,
        }, { status: 500 });
      }
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
