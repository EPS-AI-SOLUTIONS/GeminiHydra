/**
 * Debug Loop - Screenshot → Analyze → Debug → Fix → Repeat
 * Agent: Lambert (Debugging)
 *
 * Automated debugging cycle:
 * 1. Take screenshot
 * 2. Analyze with Gemini Vision
 * 3. Identify errors
 * 4. Generate fix
 * 5. Apply fix
 * 6. Take screenshot
 * 7. Verify fix
 * 8. Repeat if needed
 */

import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { exec } from 'child_process';
import { promisify } from 'util';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { FileHandlers } from '../files/FileHandlers.js';
import { Agent } from '../core/agent/Agent.js';
import { GEMINIHYDRA_DIR } from '../config/paths.config.js';
import 'dotenv/config';

const execAsync = promisify(exec);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

interface DebugIteration {
  iteration: number;
  screenshot: string;
  analysis: {
    description: string;
    errors: string[];
    suggestions: string[];
  };
  fix?: {
    file: string;
    changes: string;
    applied: boolean;
  };
  verified: boolean;
  timestamp: Date;
}

interface DebugSession {
  id: string;
  target: string; // URL or file path
  startTime: Date;
  endTime?: Date;
  iterations: DebugIteration[];
  resolved: boolean;
  summary?: string;
}

export class DebugLoop {
  private session: DebugSession | null = null;
  private maxIterations: number = 10;
  private screenshotDir: string;
  private lambertAgent: Agent;

  constructor(screenshotDir?: string) {
    this.screenshotDir = screenshotDir || path.join(GEMINIHYDRA_DIR, 'debug-screenshots');
    this.lambertAgent = new Agent('lambert');
  }

  /**
   * Initialize debug session
   */
  async init(): Promise<void> {
    await fs.mkdir(this.screenshotDir, { recursive: true });
  }

  /**
   * Start debug loop for a target
   */
  async startDebugLoop(target: string, options?: {
    maxIterations?: number;
    autoFix?: boolean;
    screenshotCommand?: string;
  }): Promise<DebugSession> {
    await this.init();

    this.maxIterations = options?.maxIterations || 10;
    const autoFix = options?.autoFix ?? true;

    this.session = {
      id: `debug-${Date.now()}`,
      target,
      startTime: new Date(),
      iterations: [],
      resolved: false,
    };

    console.log(chalk.cyan('\n🔍 Debug Loop Started'));
    console.log(chalk.gray(`Target: ${target}`));
    console.log(chalk.gray(`Max iterations: ${this.maxIterations}`));
    console.log(chalk.gray(`Auto-fix: ${autoFix}`));
    console.log('');

    let iteration = 0;
    let resolved = false;

    while (iteration < this.maxIterations && !resolved) {
      iteration++;
      console.log(chalk.yellow(`\n══ Iteration ${iteration}/${this.maxIterations} ══\n`));

      // Step 1: Take screenshot
      console.log(chalk.gray('📸 Taking screenshot...'));
      const screenshotPath = await this.takeScreenshot(iteration, options?.screenshotCommand);

      if (!screenshotPath) {
        console.log(chalk.red('Failed to take screenshot'));
        break;
      }

      // Step 2: Analyze screenshot
      console.log(chalk.gray('🔬 Analyzing screenshot...'));
      const analysis = await FileHandlers.analyzeScreenshot(screenshotPath);

      console.log(chalk.cyan('Analysis:'));
      console.log(chalk.gray(`Description: ${analysis.description.substring(0, 200)}...`));

      if (analysis.errors.length > 0) {
        console.log(chalk.red('Errors found:'));
        analysis.errors.forEach(e => console.log(chalk.red(`  - ${e}`)));
      } else {
        console.log(chalk.green('✓ No errors detected'));
      }

      // Create iteration record
      const iterationRecord: DebugIteration = {
        iteration,
        screenshot: screenshotPath,
        analysis: {
          description: analysis.description,
          errors: analysis.errors,
          suggestions: analysis.suggestions,
        },
        verified: false,
        timestamp: new Date(),
      };

      // Step 3: Check if resolved
      if (analysis.errors.length === 0) {
        console.log(chalk.green('\n✓ No errors detected - checking if resolved...'));

        // Verify by comparing with previous state
        if (iteration > 1) {
          const prevIteration = this.session.iterations[iteration - 2];
          if (prevIteration && prevIteration.analysis.errors.length > 0) {
            console.log(chalk.green('✓ Previous errors are fixed!'));
            iterationRecord.verified = true;
            resolved = true;
          }
        } else {
          // First iteration with no errors
          iterationRecord.verified = true;
          resolved = true;
        }
      }

      // Step 4: Generate and apply fix (if errors found and autoFix enabled)
      if (!resolved && analysis.errors.length > 0 && autoFix) {
        console.log(chalk.yellow('\n🔧 Generating fix...'));

        const fix = await this.generateFix(analysis);

        if (fix) {
          console.log(chalk.cyan(`Fix for: ${fix.file}`));
          console.log(chalk.gray(fix.changes.substring(0, 200) + '...'));

          // Apply fix
          console.log(chalk.yellow('Applying fix...'));
          const applied = await this.applyFix(fix);

          iterationRecord.fix = {
            file: fix.file,
            changes: fix.changes,
            applied,
          };

          if (applied) {
            console.log(chalk.green('✓ Fix applied'));

            // Wait for changes to take effect
            console.log(chalk.gray('Waiting for changes to take effect...'));
            await this.sleep(2000);
          } else {
            console.log(chalk.red('✗ Failed to apply fix'));
          }
        } else {
          console.log(chalk.yellow('Could not generate automatic fix'));
          console.log(chalk.cyan('Suggestions:'));
          analysis.suggestions.forEach(s => console.log(chalk.gray(`  - ${s}`)));
        }
      }

      this.session.iterations.push(iterationRecord);
    }

    // Finalize session
    this.session.endTime = new Date();
    this.session.resolved = resolved;
    this.session.summary = this.generateSummary();

    console.log(chalk.cyan('\n═══ Debug Session Complete ═══'));
    console.log(this.session.summary);

    return this.session;
  }

  /**
   * Take a screenshot
   */
  async takeScreenshot(iteration: number, customCommand?: string): Promise<string | null> {
    const filename = `screenshot-${iteration}-${Date.now()}.png`;
    const filepath = path.join(this.screenshotDir, filename);

    try {
      if (customCommand) {
        // Use custom screenshot command
        await execAsync(customCommand.replace('{output}', filepath));
      } else {
        // Platform-specific screenshot
        const platform = process.platform;

        if (platform === 'win32') {
          // Windows: Use PowerShell
          await execAsync(`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::PrimaryScreen | ForEach-Object { $bitmap = New-Object System.Drawing.Bitmap($_.Bounds.Width, $_.Bounds.Height); $graphics = [System.Drawing.Graphics]::FromImage($bitmap); $graphics.CopyFromScreen($_.Bounds.Location, [System.Drawing.Point]::Empty, $_.Bounds.Size); $bitmap.Save('${filepath}'); }"`);
        } else if (platform === 'darwin') {
          // macOS
          await execAsync(`screencapture -x ${filepath}`);
        } else {
          // Linux: Try various tools
          try {
            await execAsync(`gnome-screenshot -f ${filepath}`);
          } catch {
            try {
              await execAsync(`scrot ${filepath}`);
            } catch {
              await execAsync(`import -window root ${filepath}`);
            }
          }
        }
      }

      // Verify file exists
      await fs.access(filepath);
      return filepath;
    } catch (error: any) {
      console.error(chalk.red(`Screenshot failed: ${error.message}`));
      return null;
    }
  }

  /**
   * Generate fix based on analysis
   */
  private async generateFix(analysis: {
    description: string;
    errors: string[];
    suggestions: string[];
  }): Promise<{ file: string; changes: string } | null> {
    try {
      const prompt = `Based on this error analysis, generate a code fix:

ERRORS:
${analysis.errors.join('\n')}

SUGGESTIONS:
${analysis.suggestions.join('\n')}

CONTEXT:
${analysis.description}

Generate a specific code fix. Return in this format:
FILE: <filepath to modify>
CHANGES:
\`\`\`
<the code changes to apply>
\`\`\`

If you cannot determine a specific fix, return:
FILE: unknown
CHANGES: Manual intervention required`;

      const response = await this.lambertAgent.think(prompt);

      // Parse response
      const fileMatch = response.match(/FILE:\s*(.+)/);
      const changesMatch = response.match(/CHANGES:\s*```[\w]*\n([\s\S]+?)```/);

      if (fileMatch && changesMatch) {
        return {
          file: fileMatch[1].trim(),
          changes: changesMatch[1].trim(),
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Apply a fix to a file
   */
  private async applyFix(fix: { file: string; changes: string }): Promise<boolean> {
    if (fix.file === 'unknown') return false;

    try {
      // Check if file exists
      await fs.access(fix.file);

      // Read current content
      const currentContent = await fs.readFile(fix.file, 'utf-8');

      // For safety, create backup
      const backupPath = `${fix.file}.backup`;
      await fs.writeFile(backupPath, currentContent);

      // Apply changes (simple replacement for now)
      // In production, use proper diff/patch
      await fs.writeFile(fix.file, fix.changes);

      console.log(chalk.gray(`Backup created: ${backupPath}`));
      return true;
    } catch (error: any) {
      console.error(chalk.red(`Apply fix failed: ${error.message}`));
      return false;
    }
  }

  /**
   * Generate session summary
   */
  private generateSummary(): string {
    if (!this.session) return '';

    const duration = this.session.endTime
      ? (this.session.endTime.getTime() - this.session.startTime.getTime()) / 1000
      : 0;

    const lines: string[] = [];
    lines.push(`Target: ${this.session.target}`);
    lines.push(`Duration: ${duration.toFixed(1)}s`);
    lines.push(`Iterations: ${this.session.iterations.length}`);
    lines.push(`Resolved: ${this.session.resolved ? 'Yes ✓' : 'No ✗'}`);

    const fixes = this.session.iterations.filter(i => i.fix?.applied);
    if (fixes.length > 0) {
      lines.push(`\nFixes applied:`);
      fixes.forEach(f => {
        lines.push(`  - ${f.fix!.file}`);
      });
    }

    const unresolvedErrors = this.session.iterations[this.session.iterations.length - 1]?.analysis.errors || [];
    if (unresolvedErrors.length > 0) {
      lines.push(`\nUnresolved errors:`);
      unresolvedErrors.forEach(e => {
        lines.push(`  - ${e}`);
      });
    }

    return lines.join('\n');
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current session
   */
  getSession(): DebugSession | null {
    return this.session;
  }

  /**
   * Export session to file
   */
  async exportSession(filepath: string): Promise<void> {
    if (!this.session) throw new Error('No active session');

    await fs.writeFile(filepath, JSON.stringify(this.session, null, 2));
    console.log(chalk.green(`Session exported to: ${filepath}`));
  }
}

/**
 * Quick debug function
 */
export async function debugWithScreenshot(
  target: string,
  options?: {
    maxIterations?: number;
    autoFix?: boolean;
  }
): Promise<DebugSession> {
  const debugLoop = new DebugLoop();
  return debugLoop.startDebugLoop(target, options);
}

export default DebugLoop;
