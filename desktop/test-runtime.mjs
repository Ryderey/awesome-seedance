import { _electron as electron } from 'playwright';
import { once } from 'node:events';
import assert from 'node:assert/strict';

// Run this native desktop harness outside the agent's restricted process sandbox.
// Electron still keeps its own renderer sandbox enabled by the application.
export async function launchTest(options) {
  const application = await electron.launch({ timeout: 15000, ...options });
  const child = application.process();
  let fatal = false;
  child.stderr.on('data', chunk => {
    if (/GPU process isn't usable|FATAL:|exit_code=-2147483645|0x80000003/i.test(String(chunk))) fatal = true;
  });
  const exited = once(child, 'exit');
  console.log(`Electron test process ${child.pid} started.`);
  return {
    application,
    async close() {
      await application.close();
      const [code, signal] = await exited;
      assert.equal(fatal, false, 'Native Electron fatal error detected');
      assert.equal(code, 0, `Electron exited abnormally (${code}, ${signal})`);
      console.log(`Electron test process ${child.pid} exited normally.`);
    },
  };
}
