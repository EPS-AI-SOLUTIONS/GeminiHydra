#!/usr/bin/env npx tsx
/**
 * GeminiHydra - Serena Test CLI
 * Testuje połączenie z Serena MCP server
 *
 * Usage:
 *   npx tsx bin/serena-test.ts
 *   npx tsx bin/serena-test.ts --project ClaudeHydra
 */

import { createSerenaService } from '../src/mcp/index.js';

async function main() {
  const args = process.argv.slice(2);
  let projectName = '';

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--project' || args[i] === '-p') && args[i + 1]) {
      projectName = args[i + 1];
      i++;
    }
    if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
GeminiHydra - Serena Test

Usage:
  npx tsx bin/serena-test.ts [options]

Options:
  --project, -p <name>  Project name from ~/.serena/serena_config.yml
  --help, -h            Show this help

Requirements:
  - Python 3.8+
  - uvx (pip install uv)
  - Project registered in ~/.serena/serena_config.yml
`);
      return;
    }
  }

  console.log('\n=== GeminiHydra - Serena Test ===\n');

  // Create Serena service
  const serena = createSerenaService({});

  try {
    // Connect
    console.log('[1/7] Connecting to Serena...');
    const connected = await serena.connect();
    if (!connected) {
      console.error('Failed to connect to Serena');
      process.exit(1);
    }
    console.log('Connected!\n');

    // Get tools
    console.log('[2/7] Getting available tools...');
    const tools = await serena.getTools();
    console.log(`Available tools (${tools.length}):`);
    tools.slice(0, 10).forEach((t) => {
      console.log(`  - ${t.name}: ${t.description?.slice(0, 60) || 'No description'}...`);
    });
    if (tools.length > 10) {
      console.log(`  ... and ${tools.length - 10} more`);
    }
    console.log();

    // Try to activate project
    console.log('[3/7] Activating project...');
    let projectActivated = false;
    const projectsToTry = projectName ? [projectName] : ['ClaudeHydra', 'Tissaia', 'app-1.1.1520'];

    for (const proj of projectsToTry) {
      try {
        const activateResult = await serena.activateProject(proj);
        console.log(`Activated project: ${proj}`);
        console.log(activateResult.slice(0, 300));
        projectActivated = true;
        break;
      } catch (err) {
        if (projectName) {
          console.log(`Failed to activate ${proj}:`, (err as Error).message.slice(0, 100));
        }
      }
    }
    if (!projectActivated) {
      console.log('No project could be activated.');
      console.log('Register your project in ~/.serena/serena_config.yml');
      console.log('Then run: npx tsx bin/serena-test.ts --project YourProjectName\n');
    }
    console.log();

    if (projectActivated) {
      // List directory
      console.log('[4/7] Listing project directory...');
      try {
        const dirContent = await serena.listDir('.', false);
        console.log('Directory contents:');
        console.log(dirContent.slice(0, 500) + (dirContent.length > 500 ? '...' : ''));
        console.log();
      } catch (err) {
        console.log('list_dir failed:', (err as Error).message.slice(0, 200), '\n');
      }

      // Search for pattern
      console.log('[5/7] Searching for "class"...');
      try {
        const searchResult = await serena.searchForPattern('class');
        console.log('Search results:');
        console.log(searchResult.slice(0, 600) + (searchResult.length > 600 ? '...' : ''));
        console.log();
      } catch (err) {
        console.log('search_for_pattern failed:', (err as Error).message.slice(0, 200), '\n');
      }

      // Get symbols overview
      console.log('[6/7] Getting symbols overview...');
      try {
        const symbols = await serena.getSymbolsOverview('.');
        console.log('Symbols overview:');
        console.log(symbols.slice(0, 800) + (symbols.length > 800 ? '...' : ''));
        console.log();
      } catch (err) {
        console.log('get_symbols_overview failed:', (err as Error).message.slice(0, 200), '\n');
      }

      // Find a symbol
      console.log('[7/7] Testing find_symbol...');
      try {
        const symbol = await serena.findSymbol('*', false);
        console.log('Result:');
        console.log(symbol.slice(0, 500) + (symbol.length > 500 ? '...' : ''));
        console.log();
      } catch (err) {
        console.log('find_symbol failed:', (err as Error).message.slice(0, 200), '\n');
      }
    } else {
      console.log('[4-7/7] Skipping tests (no active project)\n');
    }

    console.log('=== Test completed! ===\n');

    // Disconnect
    await serena.disconnect();
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

main().catch(console.error);
