/**
 * END-TO-END PRIMITIVE TEST — HARNESS NATIVE VERSION
 * 
 * Run this in Claude Code, OpenCode, or OMP session.
 * It uses the native tools.* API already available in the harness.
 * 
 * Usage: Paste this entire file into a session and ask the agent to run it.
 * Or: bun run e2e-test-harness.ts (if running with tools.* available)
 */

// Type definitions for the test
interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  const start = performance.now();
  try {
    await fn();
    results.push({ name, passed: true, duration: performance.now() - start });
    console.log(`✓ ${name}`);
  } catch (error) {
    const err = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, error: err, duration: performance.now() - start });
    console.log(`✗ ${name}: ${err}`);
  }
}

// ===== ALL PRIMITIVE TESTS =====

async function runAllTests() {
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  END-TO-END PRIMITIVE TEST");
  console.log("  Testing: All 9 primitive types via tools.executor.*");
  console.log("═══════════════════════════════════════════════════════════\n");

  // 1. SKILLS
  await test("executor.skill.list", async () => {
    const skills = await (tools as any).executor.skill.list({});
    if (!Array.isArray(skills)) throw new Error("Expected array");
    console.log(`  → ${skills.length} skills available`);
  });

  await test("executor.skill.load (starting-session)", async () => {
    const skill = await (tools as any).executor.skill.load({ name: "starting-session" });
    if (!skill.content) throw new Error("No content");
    console.log(`  → Loaded: ${skill.name}`);
  });

  // executor.skill.execute — live test is slow/costly, so this just verifies the tool exists
  await test("executor.skill.execute (tool present)", async () => {
    const hits = await (tools as any).discover({ query: "execute skill", limit: 5 });
    const found = hits.results?.some((h: any) => h.path === "executor.skill.execute");
    if (!found) throw new Error("executor.skill.execute not in catalog");
    console.log(`  → executor.skill.execute registered`);
  });

  // 2. RULES
  await test("executor.rule.list", async () => {
    const rules = await (tools as any).executor.rule.list({});
    if (!Array.isArray(rules)) throw new Error("Expected array");
    console.log(`  → ${rules.length} rules available`);
  });

  await test("executor.rule.load (git)", async () => {
    const rule = await (tools as any).executor.rule.load({ name: "git" });
    if (!rule.content) throw new Error("No content");
    console.log(`  → Loaded: ${rule.name}`);
  });

  // 3. SUBAGENTS
  await test("executor.subagent.list", async () => {
    const subagents = await (tools as any).executor.subagent.list({});
    if (!Array.isArray(subagents)) throw new Error("Expected array");
    console.log(`  → ${subagents.length} subagents: ${subagents.map((s: any) => s.name).join(", ")}`);
  });

  await test("executor.subagent.load (architect)", async () => {
    const subagent = await (tools as any).executor.subagent.load({ name: "architect" });
    if (!subagent.content) throw new Error("No content");
    console.log(`  → Loaded: ${subagent.name}`);
  });

  // 4. COMMANDS
  await test("executor.command.list", async () => {
    const commands = await (tools as any).executor.command.list({});
    if (!Array.isArray(commands)) throw new Error("Expected array");
    console.log(`  → ${commands.length} commands available`);
  });

  await test("executor.command.load (kota)", async () => {
    const cmd = await (tools as any).executor.command.load({ name: "kota" });
    if (!cmd.content) throw new Error("No content");
    console.log(`  → Loaded: ${cmd.name}`);
  });

  await test("executor.command.run (tool present)", async () => {
    const hits = await (tools as any).discover({ query: "run command", limit: 5 });
    const found = hits.results?.some((h: any) => h.path === "executor.command.run");
    if (!found) throw new Error("executor.command.run not in catalog");
    console.log(`  → executor.command.run registered`);
  });

  // 5. HOOKS
  await test("executor.hook.list", async () => {
    const hooks = await (tools as any).executor.hook.list({});
    if (!Array.isArray(hooks)) throw new Error("Expected array");
    console.log(`  → ${hooks.length} hooks available`);
  });

  await test("executor.hook.load (chain)", async () => {
    const hook = await (tools as any).executor.hook.load({ name: "chain" });
    if (!hook.content) throw new Error("No content");
    console.log(`  → Loaded: ${hook.name}`);
  });

  // 6. INTEGRATIONS
  await test("executor.integration.list", async () => {
    const integrations = await (tools as any).executor.integration.list({});
    if (!Array.isArray(integrations)) throw new Error("Expected array");
    console.log(`  → ${integrations.length} integrations available`);
  });

  // 7. PLUGINS
  await test("executor.plugin.list", async () => {
    const plugins = await (tools as any).executor.plugin.list({});
    if (!Array.isArray(plugins)) throw new Error("Expected array");
    console.log(`  → ${plugins.length} plugins available`);
  });

  await test("executor.plugin.load (scratchpad)", async () => {
    const plugin = await (tools as any).executor.plugin.load({ name: "scratchpad" });
    if (!plugin.content) throw new Error("No content");
    console.log(`  → Loaded: ${plugin.name}`);
  });

  // 8. AGENT-FILE
  await test("executor.agentFile.load", async () => {
    const agentFile = await (tools as any).executor.agentFile.load({});
    if (!agentFile.content) throw new Error("No content");
    console.log(`  → Loaded AGENTS.md (${agentFile.content.length} chars)`);
  });

  // 9. UNIFIED PRIMITIVES (NEW)
  await test("executor.primitives.discover", async () => {
    const result = await (tools as any).executor.primitives.discover({});
    if (!result.byType) throw new Error("Missing byType");
    const total = Object.values(result.byType).reduce((sum: number, arr: any) => sum + arr.length, 0);
    console.log(`  → Discovered ${total} total primitives`);
    for (const [type, items] of Object.entries(result.byType)) {
      console.log(`    - ${type}: ${(items as any[]).length}`);
    }
  });

  await test("executor.primitives.help", async () => {
    const help = await (tools as any).executor.primitives.help({});
    if (!help.quickStart) throw new Error("Missing quickStart");
    console.log(`  → Help available: ${help.quickStart.substring(0, 50)}...`);
  });

  await test("executor.primitives.getByType (skills)", async () => {
    const skills = await (tools as any).executor.primitives.getByType({ type: "skill" });
    if (!Array.isArray(skills)) throw new Error("Expected array");
    console.log(`  → Got ${skills.length} skills via unified API`);
  });

  await test("executor.primitives.get (architect subagent)", async () => {
    const subagent = await (tools as any).executor.primitives.get({ name: "architect", type: "subagent" });
    if (!subagent) throw new Error("Not found");
    console.log(`  → Found: ${subagent.name}`);
  });

  // THE BIG TEST: Subagent delegation with primitives
  await test("executor.subagent.delegate (architect w/ primitives introspection)", async () => {
    // Ask the architect subagent to use primitives to understand the system
    const result = await (tools as any).executor.subagent.delegate({
      name: "architect",
      input: "Use tools.executor.primitives.discover() to see what primitives are available, then summarize the 3 most important ones for system design work. Be brief (2-3 sentences)."
    });
    if (!result.result) throw new Error("No result from subagent");
    console.log(`  → Subagent response (${result.result.length} chars):`);
    console.log(`    "${result.result.substring(0, 120)}..."`);
  });

  // ===== SUMMARY =====
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  RESULTS");
  console.log("═══════════════════════════════════════════════════════════");
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;
  
  console.log(`\n  Total: ${total} tests`);
  console.log(`  Passed: ${passed} ✓`);
  console.log(`  Failed: ${failed} ${failed > 0 ? '✗' : ''}`);
  
  if (failed > 0) {
    console.log("\n  Failed tests:");
    results.filter(r => !r.passed).forEach(r => {
      console.log(`    - ${r.name}: ${r.error}`);
    });
  }
  
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(failed === 0 ? "  ALL TESTS PASSED — IT FUCKING WORKS ✓" : "  SOME TESTS FAILED ✗");
  console.log("═══════════════════════════════════════════════════════════\n");
}

// Auto-run if executed directly
if (typeof window !== 'undefined' || typeof Bun !== 'undefined') {
  runAllTests().catch(console.error);
}

// Export for manual use
export { runAllTests, test, results };
