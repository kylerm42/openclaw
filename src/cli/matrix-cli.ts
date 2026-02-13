/**
 * Matrix-specific CLI commands.
 * Handles device verification and other Matrix operations.
 */

import type { Command } from "commander";
import { callGateway } from "../gateway/call.js";
import { danger } from "../globals.js";
import { defaultRuntime } from "../runtime.js";
import { formatDocsLink } from "../terminal/links.js";
import { renderTable } from "../terminal/table.js";
import { theme } from "../terminal/theme.js";
import { runCommandWithRuntime } from "./cli-utils.js";

type VerificationStatusResponse = {
  deviceId: string;
  verified: boolean;
  activeSession: {
    transactionId: string;
    state: string;
    emoji?: Array<{ emoji: string; name: string }>;
    expiresAt: number;
    createdAt: number;
  } | null;
};

type VerificationConfirmResponse = {
  success: boolean;
  message: string;
};

type VerificationCancelResponse = {
  success: boolean;
  message: string;
};

function runMatrixCommand(action: () => Promise<void>) {
  return runCommandWithRuntime(defaultRuntime, action, (err) => {
    defaultRuntime.error(danger(`Matrix command failed: ${String(err)}`));
    defaultRuntime.exit(1);
  });
}

/**
 * Display verification status in a readable format.
 */
function displayVerificationStatus(status: VerificationStatusResponse, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  // Basic device info
  const deviceRow = [`Device ID`, theme.highlight(status.deviceId)];
  const verifiedRow = [
    `Verification Status`,
    status.verified ? theme.success("✅ Verified") : theme.warning("⚠️  Unverified"),
  ];

  const rows = [deviceRow, verifiedRow];

  if (status.activeSession) {
    const session = status.activeSession;
    const now = Date.now();
    const expiresIn = Math.max(0, Math.floor((session.expiresAt - now) / 1000));
    const expiresText =
      expiresIn > 0 ? `${Math.floor(expiresIn / 60)}m ${expiresIn % 60}s` : theme.danger("Expired");

    rows.push(
      [`Active Session`, theme.highlight(session.transactionId.substring(0, 12) + "...")],
      [`Session State`, theme.muted(session.state)],
      [`Expires In`, expiresText],
    );

    if (session.emoji && session.emoji.length > 0) {
      defaultRuntime.log("\n" + theme.bold("Verification Emoji:"));
      defaultRuntime.log(theme.muted("Compare these with Element to confirm device identity\n"));

      // Display emoji in a nice box
      const emojiLine = session.emoji.map((e) => `${e.emoji}  ${e.name}`).join("   ");
      const boxWidth = 80;
      const padding = Math.max(0, Math.floor((boxWidth - emojiLine.length) / 2));
      const paddingStr = " ".repeat(padding);

      defaultRuntime.log("┌" + "─".repeat(boxWidth - 2) + "┐");
      defaultRuntime.log("│" + paddingStr + theme.bold(emojiLine) + paddingStr + "│");
      defaultRuntime.log("└" + "─".repeat(boxWidth - 2) + "┘\n");
    }
  } else {
    rows.push([`Active Session`, theme.muted("None")]);
  }

  const table = renderTable({
    headers: [],
    rows,
    options: { noHeader: true },
  });
  defaultRuntime.log(table);

  // Display next steps based on state
  if (!status.verified && !status.activeSession) {
    defaultRuntime.log("\n" + theme.highlight("Next Steps:"));
    defaultRuntime.log(theme.muted("1. Restart gateway to trigger a new verification request"));
    defaultRuntime.log(
      theme.muted("2. Open Element and look for 'New login needs verification' notification"),
    );
    defaultRuntime.log(theme.muted("3. Click 'Verify' in Element"));
    defaultRuntime.log(theme.muted("4. Compare emoji and run: openclaw matrix verify confirm"));
  } else if (status.activeSession?.state === "confirming" && status.activeSession.emoji) {
    defaultRuntime.log("\n" + theme.highlight("Next Steps:"));
    defaultRuntime.log(theme.muted("1. Compare the emoji above with what Element shows"));
    defaultRuntime.log(theme.muted("2. If they match, run: openclaw matrix verify confirm"));
    defaultRuntime.log(theme.muted("3. If they don't match, run: openclaw matrix verify cancel"));
    defaultRuntime.log(
      theme.danger("\n⚠️  DO NOT CONFIRM if emoji do not match - this indicates a security issue!"),
    );
  } else if (status.activeSession) {
    defaultRuntime.log("\n" + theme.muted("Waiting for verification protocol to complete..."));
  }

  defaultRuntime.log(
    "\n" +
      theme.muted("Docs: ") +
      formatDocsLink("/channels/matrix#verification", "docs.openclaw.ai/channels/matrix"),
  );
}

/**
 * Handle verification status command.
 */
async function handleVerifyStatus(opts: { json?: boolean }): Promise<void> {
  try {
    const result = await callGateway<VerificationStatusResponse>({
      method: "matrix.verify.status",
      timeoutMs: 10_000,
    });

    displayVerificationStatus(result, Boolean(opts.json));
  } catch (error) {
    throw new Error(`Failed to get verification status: ${String(error)}`, { cause: error });
  }
}

/**
 * Handle verification confirm command.
 */
async function handleVerifyConfirm(opts: { transactionId?: string }): Promise<void> {
  try {
    const result = await callGateway<VerificationConfirmResponse>({
      method: "matrix.verify.confirm",
      params: { transactionId: opts.transactionId },
      timeoutMs: 10_000,
    });

    if (result.success) {
      defaultRuntime.log(theme.success("✅ " + result.message));
      defaultRuntime.log(theme.muted("\nWaiting for Element to complete verification..."));
      defaultRuntime.log(theme.muted("Check status: openclaw matrix verify status"));
    } else {
      throw new Error(result.message);
    }
  } catch (error) {
    throw new Error(`Failed to confirm verification: ${String(error)}`, { cause: error });
  }
}

/**
 * Handle verification cancel command.
 */
async function handleVerifyCancel(opts: {
  transactionId?: string;
  reason?: string;
}): Promise<void> {
  try {
    const result = await callGateway<VerificationCancelResponse>({
      method: "matrix.verify.cancel",
      params: {
        transactionId: opts.transactionId,
        reason: opts.reason,
      },
      timeoutMs: 10_000,
    });

    if (result.success) {
      defaultRuntime.log(theme.success("✅ " + result.message));
      defaultRuntime.log(theme.muted("Restart gateway to trigger a new verification request"));
    } else {
      throw new Error(result.message);
    }
  } catch (error) {
    throw new Error(`Failed to cancel verification: ${String(error)}`, { cause: error });
  }
}

/**
 * Register Matrix CLI commands.
 */
export function registerMatrixCli(program: Command): void {
  const matrix = program
    .command("matrix")
    .description("Matrix-specific operations")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink(
          "/channels/matrix",
          "docs.openclaw.ai/channels/matrix",
        )}\n`,
    );

  const verify = matrix
    .command("verify")
    .description("Matrix device verification commands")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink(
          "/channels/matrix#verification",
          "docs.openclaw.ai/channels/matrix#verification",
        )}\n`,
    );

  verify
    .command("status")
    .description("Show device verification status and active sessions")
    .option("--json", "Output JSON", false)
    .action(async (opts) => {
      await runMatrixCommand(async () => {
        await handleVerifyStatus(opts);
      });
    });

  verify
    .command("confirm")
    .description("Confirm emoji match and complete verification")
    .option("--transaction-id <id>", "Specific transaction ID (defaults to most recent)")
    .action(async (opts) => {
      await runMatrixCommand(async () => {
        await handleVerifyConfirm({
          transactionId: opts.transactionId,
        });
      });
    });

  verify
    .command("cancel")
    .description("Cancel active verification session")
    .option("--transaction-id <id>", "Specific transaction ID (defaults to most recent)")
    .option("--reason <text>", "Cancellation reason", "User cancelled via CLI")
    .action(async (opts) => {
      await runMatrixCommand(async () => {
        await handleVerifyCancel({
          transactionId: opts.transactionId,
          reason: opts.reason,
        });
      });
    });
}
