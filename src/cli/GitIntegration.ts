/**
 * GitIntegration - Built-in git commands with AI-generated messages
 * Feature #27: Git Integration
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import 'dotenv/config';

const execAsync = promisify(exec);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export interface GitStatus {
  branch: string;
  staged: string[];
  modified: string[];
  untracked: string[];
  ahead: number;
  behind: number;
}

export interface CommitOptions {
  message?: string;
  autoMessage?: boolean;
  files?: string[];
  amend?: boolean;
  push?: boolean;
}

export interface PROptions {
  title?: string;
  body?: string;
  base?: string;
  draft?: boolean;
  autoGenerate?: boolean;
}

/**
 * Git Integration Class
 */
export class GitIntegration {
  private cwd: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
  }

  /**
   * Execute git command
   */
  private async git(args: string): Promise<string> {
    try {
      const { stdout } = await execAsync(`git ${args}`, { cwd: this.cwd });
      return stdout.trim();
    } catch (error: any) {
      throw new Error(`Git error: ${error.message}`);
    }
  }

  /**
   * Get repository status
   */
  async getStatus(): Promise<GitStatus> {
    const branch = await this.git('branch --show-current');
    const statusOutput = await this.git('status --porcelain');

    const staged: string[] = [];
    const modified: string[] = [];
    const untracked: string[] = [];

    for (const line of statusOutput.split('\n').filter(Boolean)) {
      const status = line.substring(0, 2);
      const file = line.substring(3);

      if (status[0] !== ' ' && status[0] !== '?') {
        staged.push(file);
      }
      if (status[1] === 'M') {
        modified.push(file);
      }
      if (status === '??') {
        untracked.push(file);
      }
    }

    // Get ahead/behind
    let ahead = 0;
    let behind = 0;
    try {
      const aheadBehind = await this.git('rev-list --left-right --count HEAD...@{upstream}');
      const [a, b] = aheadBehind.split('\t').map(Number);
      ahead = a || 0;
      behind = b || 0;
    } catch {
      // No upstream
    }

    return { branch, staged, modified, untracked, ahead, behind };
  }

  /**
   * Get diff for staged changes
   */
  async getStagedDiff(): Promise<string> {
    return this.git('diff --cached');
  }

  /**
   * Get diff for unstaged changes
   */
  async getUnstagedDiff(): Promise<string> {
    return this.git('diff');
  }

  /**
   * Get recent commits
   */
  async getRecentCommits(count: number = 5): Promise<string[]> {
    const output = await this.git(`log --oneline -${count}`);
    return output.split('\n').filter(Boolean);
  }

  /**
   * Generate commit message using AI
   */
  async generateCommitMessage(diff: string): Promise<string> {
    if (!diff || diff.trim().length === 0) {
      throw new Error('No changes to commit');
    }

    const model = genAI.getGenerativeModel({
      model: 'gemini-3-pro-preview',
      generationConfig: { temperature: 0.9, maxOutputTokens: 512 }
    });

    const prompt = `Generate a concise git commit message for these changes.
Follow conventional commits format: type(scope): description
Types: feat, fix, docs, style, refactor, test, chore

Changes:
${diff.substring(0, 3000)}

Commit message (one line, max 72 chars):`;

    const result = await model.generateContent(prompt);
    const message = result.response.text().trim();

    // Clean up message
    return message
      .replace(/^["']|["']$/g, '')
      .replace(/\n.*/g, '')
      .substring(0, 72);
  }

  /**
   * Stage files
   */
  async stage(files: string[] | 'all'): Promise<void> {
    if (files === 'all') {
      await this.git('add -A');
    } else {
      await this.git(`add ${files.map(f => `"${f}"`).join(' ')}`);
    }
  }

  /**
   * Create commit
   */
  async commit(options: CommitOptions = {}): Promise<string> {
    const {
      message,
      autoMessage = false,
      files,
      amend = false,
      push = false
    } = options;

    // Stage files if specified
    if (files) {
      await this.stage(files);
    }

    // Get or generate message
    let commitMessage = message;
    if (!commitMessage && autoMessage) {
      const diff = await this.getStagedDiff();
      commitMessage = await this.generateCommitMessage(diff);
      console.log(chalk.cyan(`Generated message: ${commitMessage}`));
    }

    if (!commitMessage) {
      throw new Error('Commit message required');
    }

    // Commit
    const amendFlag = amend ? '--amend' : '';
    const result = await this.git(`commit ${amendFlag} -m "${commitMessage.replace(/"/g, '\\"')}"`);

    // Push if requested
    if (push) {
      await this.push();
    }

    return result;
  }

  /**
   * Push to remote
   */
  async push(options: { force?: boolean; setUpstream?: boolean } = {}): Promise<string> {
    const flags: string[] = [];
    if (options.force) flags.push('--force-with-lease');
    if (options.setUpstream) flags.push('-u origin HEAD');

    return this.git(`push ${flags.join(' ')}`);
  }

  /**
   * Pull from remote
   */
  async pull(options: { rebase?: boolean } = {}): Promise<string> {
    const flags = options.rebase ? '--rebase' : '';
    return this.git(`pull ${flags}`);
  }

  /**
   * Create a new branch
   */
  async createBranch(name: string, checkout: boolean = true): Promise<void> {
    if (checkout) {
      await this.git(`checkout -b ${name}`);
    } else {
      await this.git(`branch ${name}`);
    }
  }

  /**
   * Switch branch
   */
  async checkout(branch: string): Promise<void> {
    await this.git(`checkout ${branch}`);
  }

  /**
   * Generate PR description using AI
   */
  async generatePRDescription(baseBranch: string = 'main'): Promise<{ title: string; body: string }> {
    const currentBranch = await this.git('branch --show-current');
    const commits = await this.git(`log ${baseBranch}..HEAD --oneline`);
    const diff = await this.git(`diff ${baseBranch}...HEAD --stat`);

    const model = genAI.getGenerativeModel({
      model: 'gemini-3-pro-preview',
      generationConfig: { temperature: 1.0, maxOutputTokens: 1024 }
    });

    const prompt = `Generate a pull request title and description.

Branch: ${currentBranch}
Base: ${baseBranch}

Commits:
${commits}

Changes:
${diff.substring(0, 2000)}

Format:
TITLE: <concise PR title>
BODY:
## Summary
<brief description>

## Changes
<list of changes>

## Testing
<how to test>`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    const titleMatch = text.match(/TITLE:\s*(.+)/);
    const bodyMatch = text.match(/BODY:\s*([\s\S]+)/);

    return {
      title: titleMatch ? titleMatch[1].trim() : currentBranch,
      body: bodyMatch ? bodyMatch[1].trim() : 'No description provided.'
    };
  }

  /**
   * Create pull request (requires gh CLI)
   */
  async createPR(options: PROptions = {}): Promise<string> {
    const {
      title,
      body,
      base = 'main',
      draft = false,
      autoGenerate = false
    } = options;

    let prTitle = title;
    let prBody = body;

    if (autoGenerate || (!title && !body)) {
      const generated = await this.generatePRDescription(base);
      prTitle = prTitle || generated.title;
      prBody = prBody || generated.body;
    }

    const draftFlag = draft ? '--draft' : '';

    // Use gh CLI
    const { stdout } = await execAsync(
      `gh pr create --title "${prTitle}" --body "${prBody?.replace(/"/g, '\\"')}" --base ${base} ${draftFlag}`,
      { cwd: this.cwd }
    );

    return stdout.trim();
  }

  /**
   * Get PR status
   */
  async getPRStatus(): Promise<string> {
    try {
      const { stdout } = await execAsync('gh pr status', { cwd: this.cwd });
      return stdout;
    } catch (error) {
      return 'No pull requests found';
    }
  }

  /**
   * Print formatted status
   */
  async printStatus(): Promise<void> {
    const status = await this.getStatus();

    console.log(chalk.cyan(`\n═══ Git Status: ${status.branch} ═══\n`));

    if (status.staged.length > 0) {
      console.log(chalk.green('Staged:'));
      status.staged.forEach(f => console.log(chalk.green(`  + ${f}`)));
    }

    if (status.modified.length > 0) {
      console.log(chalk.yellow('Modified:'));
      status.modified.forEach(f => console.log(chalk.yellow(`  M ${f}`)));
    }

    if (status.untracked.length > 0) {
      console.log(chalk.gray('Untracked:'));
      status.untracked.forEach(f => console.log(chalk.gray(`  ? ${f}`)));
    }

    if (status.ahead > 0 || status.behind > 0) {
      console.log('');
      if (status.ahead > 0) console.log(chalk.green(`↑ ${status.ahead} commits ahead`));
      if (status.behind > 0) console.log(chalk.red(`↓ ${status.behind} commits behind`));
    }

    if (status.staged.length === 0 && status.modified.length === 0 && status.untracked.length === 0) {
      console.log(chalk.gray('Working tree clean'));
    }

    console.log('');
  }
}

// Global instance
export const git = new GitIntegration();

// Slash command handlers
export const gitCommands = {
  '/commit': async (args?: string) => {
    const gitInt = new GitIntegration();
    await gitInt.printStatus();

    if (args) {
      return gitInt.commit({ message: args });
    } else {
      return gitInt.commit({ autoMessage: true });
    }
  },

  '/push': async () => {
    const gitInt = new GitIntegration();
    return gitInt.push({ setUpstream: true });
  },

  '/pull': async () => {
    const gitInt = new GitIntegration();
    return gitInt.pull({ rebase: true });
  },

  '/pr': async (args?: string) => {
    const gitInt = new GitIntegration();
    return gitInt.createPR({
      autoGenerate: true,
      base: args || 'main'
    });
  },

  '/status': async () => {
    const gitInt = new GitIntegration();
    await gitInt.printStatus();
    return '';
  }
};

export default git;
