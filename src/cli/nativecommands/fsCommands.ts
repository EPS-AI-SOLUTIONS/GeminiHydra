/**
 * NativeCommands - File System commands
 *
 * Commands: read, ls, write, info, search, diagnose, sysinfo,
 *           validate, perms, unblock, allow, attrs, encoding
 *
 * @module cli/nativecommands/fsCommands
 */

import {
  type CommandResult,
  chalk,
  createDiagnostics,
  createFailedMessage,
  detectFileEncoding,
  dynamicAllowedPaths,
  dynamicBlockedPaths,
  error,
  formatBytes,
  getFileAttributes,
  getTools,
  highlightMatch,
  parseFlags,
  setFileAttributes,
  success,
  truncate,
} from './helpers.js';

// ============================================================
// File System Commands
// ============================================================

export const fsCommands = {
  /**
   * Read file contents
   * Supports: --encoding <enc> to specify encoding (utf-8, ascii, latin1, etc.)
   */
  async read(args: string[]): Promise<CommandResult> {
    const { flags, positional } = parseFlags(args);
    const filePath = positional[0];

    if (!filePath) {
      return error(
        'Usage: /fs read <path> [--encoding utf-8|ascii|latin1|utf16le]\n\nRead file contents with optional encoding',
      );
    }

    try {
      const tools = getTools();
      const encoding = (flags.encoding as BufferEncoding) || 'utf-8';
      const content = await tools.fs.readFile(filePath, { encoding });

      return success(
        {
          content: truncate(content, 5000),
          size: formatBytes(content.length),
          encoding,
        },
        `File: ${filePath}`,
      );
    } catch (err: unknown) {
      // Provide more helpful error messages
      const code =
        err instanceof Error && 'code' in err ? (err as NodeJS.ErrnoException).code : undefined;
      const msg = err instanceof Error ? err.message : String(err);
      if (code === 'ENOENT') {
        return error(
          `File not found: ${filePath}\n${chalk.gray('Use /fs diagnose to check path issues')}`,
        );
      }
      if (code === 'EACCES') {
        return error(
          `Permission denied: ${filePath}\n${chalk.gray('Use /fs perms to check permissions')}`,
        );
      }
      if (msg?.includes('blocked')) {
        return error(
          `Path is blocked: ${filePath}\n${chalk.gray('Use /fs unblock to temporarily allow access')}`,
        );
      }
      return error(createFailedMessage('read file', err));
    }
  },

  /**
   * List directory
   */
  async ls(args: string[]): Promise<CommandResult> {
    const dirPath = args[0] || '.';
    const recursive = args.includes('-r') || args.includes('--recursive');

    try {
      const tools = getTools();
      const fileInfos = await tools.fs.listDirectory(dirPath, { recursive });
      const files = fileInfos.map((f) => f.path);

      return success(
        {
          files: files.slice(0, 100),
          total: files.length,
          showing: Math.min(100, files.length),
        },
        `Directory: ${dirPath}`,
      );
    } catch (err) {
      return error(createFailedMessage('list directory', err));
    }
  },

  /**
   * Write file
   * Supports:
   *   --encoding <enc> to specify encoding (utf-8, ascii, latin1, etc.)
   *   --force to remove readonly attribute before writing
   */
  async write(args: string[]): Promise<CommandResult> {
    const { flags, positional } = parseFlags(args);
    const filePath = positional[0];
    const content = positional.slice(1).join(' ');

    if (!filePath || !content) {
      return error(
        'Usage: /fs write <path> <content> [--encoding utf-8] [--force]\n\n--force: Remove readonly attribute before writing\n--encoding: Specify file encoding',
      );
    }

    try {
      const tools = getTools();
      const encoding = (flags.encoding as BufferEncoding) || 'utf-8';

      // Handle --force flag to remove readonly attribute
      if (flags.force) {
        try {
          const attrs = await getFileAttributes(filePath);
          if (attrs.readonly) {
            const result = await setFileAttributes(filePath, { readonly: false });
            if (!result.success) {
              return error(`Cannot remove readonly attribute: ${result.error}`);
            }
          }
        } catch {
          // File might not exist yet, which is fine
        }
      }

      await tools.fs.writeFile(filePath, content, { encoding });

      return success(
        {
          bytes: content.length,
          encoding,
          forced: !!flags.force,
        },
        `Written to: ${filePath}`,
      );
    } catch (err: unknown) {
      // Provide more helpful error messages
      const code =
        err instanceof Error && 'code' in err ? (err as NodeJS.ErrnoException).code : undefined;
      const msg = err instanceof Error ? err.message : String(err);
      if (code === 'EACCES' || code === 'EPERM') {
        return error(
          `Permission denied: ${filePath}\n${chalk.gray('Try using --force to remove readonly attribute')}`,
        );
      }
      if (code === 'ENOENT') {
        return error(
          `Directory not found for: ${filePath}\n${chalk.gray('Parent directory must exist')}`,
        );
      }
      if (msg?.includes('blocked')) {
        return error(
          `Path is blocked: ${filePath}\n${chalk.gray('Use /fs unblock to temporarily allow access')}`,
        );
      }
      return error(createFailedMessage('write file', err));
    }
  },

  /**
   * Get file info
   */
  async info(args: string[]): Promise<CommandResult> {
    if (!args[0]) {
      return error('Usage: /fs info <path>');
    }

    try {
      const tools = getTools();
      const info = await tools.fs.getFileInfo(args[0]);

      return success(
        {
          size: formatBytes(info.size ?? 0),
          modified: info.modified?.toISOString() ?? 'unknown',
          created: info.created?.toISOString(),
          isDirectory: info.isDirectory,
          isFile: info.isFile,
        },
        `File Info: ${args[0]}`,
      );
    } catch (err) {
      return error(createFailedMessage('get info', err));
    }
  },

  /**
   * Search in file contents (simple grep-like text search)
   * NOTE: For LSP-powered semantic search, use /serena search instead
   */
  async search(args: string[]): Promise<CommandResult> {
    if (!args[0]) {
      return error('Usage: /fs search <pattern> [glob]');
    }

    const [pattern, glob] = args;

    try {
      const tools = getTools();
      const matches = await tools.fs.searchContent(pattern, { glob });

      const results = matches.slice(0, 20).map((m) => ({
        file: m.file,
        line: m.line,
        match: highlightMatch(truncate(m.content, 80), pattern),
      }));

      return success(
        {
          results,
          showing: Math.min(20, matches.length),
        },
        `Found ${matches.length} matches for "${pattern}"`,
      );
    } catch (err) {
      return error(createFailedMessage('search', err));
    }
  },

  /**
   * Comprehensive filesystem diagnostics using FileSystemDiagnostics module
   * Provides detailed information about path validity, permissions, attributes, etc.
   */
  async diagnose(args: string[]): Promise<CommandResult> {
    if (!args[0]) {
      return error('Usage: /fs diagnose <path>');
    }

    const targetPath = args[0];
    const showSystemInfo = args.includes('--system') || args.includes('-s');

    try {
      const diagnostics = createDiagnostics({
        rootDir: process.cwd(),
      });

      const result = await diagnostics.diagnose(targetPath);

      // Print formatted output
      diagnostics.printDiagnostic(result);

      // Optionally show system info
      if (showSystemInfo) {
        const sysInfo = diagnostics.getSystemInfo();
        diagnostics.printSystemInfo(sysInfo);
      }

      // Return structured data
      return success(
        {
          path: result.path,
          exists: result.exists,
          readable: result.readable,
          writable: result.writable,
          isDirectory: result.isDirectory,
          isFile: result.isFile,
          isSymlink: result.isSymlink,
          isBlocked: result.isBlocked,
          size: result.size,
          encoding: result.encoding,
          blockedReason: result.blockedReason,
          permissions: {
            mode: result.permissions.modeString,
            readable: result.permissions.readable,
            writable: result.permissions.writable,
            executable: result.permissions.executable,
          },
          pathValidation: {
            valid: result.pathValidation.valid,
            issues: result.pathValidation.issues,
          },
          errors: result.errors,
          warnings: result.warnings,
        },
        `Diagnostics for: ${targetPath}`,
      );
    } catch (err) {
      return error(createFailedMessage('diagnose path', err));
    }
  },

  /**
   * Get system filesystem information
   */
  async sysinfo(): Promise<CommandResult> {
    try {
      const diagnostics = createDiagnostics();
      const info = diagnostics.getSystemInfo();

      diagnostics.printSystemInfo(info);

      return success(
        {
          platform: info.platform,
          release: info.release,
          arch: info.arch,
          user: info.user.username,
          homeDir: info.user.homeDir,
          cwd: info.user.cwd,
          limits: info.limits,
          tempDir: info.env.tempDir,
        },
        'System Filesystem Info',
      );
    } catch (err) {
      return error(createFailedMessage('get system info', err));
    }
  },

  /**
   * Validate a path without checking existence
   */
  async validate(args: string[]): Promise<CommandResult> {
    if (!args[0]) {
      return error('Usage: /fs validate <path>');
    }

    try {
      const diagnostics = createDiagnostics();
      const result = diagnostics.checkPath(args[0]);

      const statusIcon = result.valid ? chalk.green('[VALID]') : chalk.red('[INVALID]');

      console.log(`\n${statusIcon} Path: ${result.originalPath}`);
      console.log(`  Resolved: ${result.resolvedPath}`);
      console.log(`  Is Absolute: ${result.isAbsolute}`);
      console.log(`  Has Traversal: ${result.hasTraversal}`);
      console.log(`  Path Too Long: ${result.pathTooLong}`);

      if (result.issues.length > 0) {
        console.log(chalk.yellow('\n  Issues:'));
        for (const issue of result.issues) {
          console.log(chalk.red(`    - ${issue}`));
        }
      }

      return success(result, result.valid ? 'Path is valid' : 'Path has issues');
    } catch (err) {
      return error(createFailedMessage('validate path', err));
    }
  },

  /**
   * Check permissions on a path
   */
  async perms(args: string[]): Promise<CommandResult> {
    if (!args[0]) {
      return error('Usage: /fs perms <path>');
    }

    try {
      const diagnostics = createDiagnostics();
      const result = await diagnostics.checkPermissions(args[0]);

      const readable = result.readable ? chalk.green('YES') : chalk.red('NO');
      const writable = result.writable ? chalk.green('YES') : chalk.red('NO');
      const executable = result.executable ? chalk.green('YES') : chalk.red('NO');

      console.log(`\nPermissions for: ${result.path}`);
      console.log(`  Mode: ${result.modeString || 'N/A'}`);
      console.log(`  Readable: ${readable}`);
      console.log(`  Writable: ${writable}`);
      console.log(`  Executable: ${executable}`);

      if (result.owner) {
        console.log(`  Owner: uid=${result.owner}, gid=${result.group}`);
      }

      if (result.error) {
        console.log(chalk.red(`  Error: ${result.error}`));
      }

      return success(result, 'Permission check complete');
    } catch (err) {
      return error(createFailedMessage('check permissions', err));
    }
  },

  /**
   * Unblock a path - remove from blocked paths list (session-only)
   */
  async unblock(args: string[]): Promise<CommandResult> {
    if (!args[0]) {
      return error('Usage: /fs unblock <path>\n\nRemoves path from blocked list for this session');
    }

    const targetPath = args[0];

    try {
      // Remove from dynamic blocked paths
      dynamicBlockedPaths.delete(targetPath);

      // Add to dynamic allowed paths (overrides blocked)
      dynamicAllowedPaths.add(targetPath);

      return success(
        {
          path: targetPath,
          action: 'unblocked',
          allowedPaths: Array.from(dynamicAllowedPaths),
        },
        `Path unblocked: ${targetPath}\n${chalk.gray('Note: This is a session-only change.')}`,
      );
    } catch (err) {
      return error(createFailedMessage('unblock path', err));
    }
  },

  /**
   * Allow a path - add to allowed paths list (session-only)
   */
  async allow(args: string[]): Promise<CommandResult> {
    if (!args[0]) {
      return error('Usage: /fs allow <path>\n\nAdds path to allowed list for this session');
    }

    const targetPath = args[0];

    try {
      dynamicAllowedPaths.add(targetPath);

      return success(
        {
          path: targetPath,
          action: 'allowed',
          allowedPaths: Array.from(dynamicAllowedPaths),
        },
        `Path allowed: ${targetPath}\n${chalk.gray('Note: This is a session-only change.')}`,
      );
    } catch (err) {
      return error(createFailedMessage('allow path', err));
    }
  },

  /**
   * Show file attributes (Windows: R,H,S,A / Unix: permissions)
   */
  async attrs(args: string[]): Promise<CommandResult> {
    if (!args[0]) {
      return error(
        'Usage: /fs attrs <path> [--set readonly|hidden] [--unset readonly|hidden]\n\nShow or modify file attributes',
      );
    }

    const { flags, positional } = parseFlags(args);
    const filePath = positional[0];

    if (!filePath) {
      return error('Path is required');
    }

    try {
      // Check if setting attributes
      if (flags.set || flags.unset) {
        const setOptions: { readonly?: boolean; hidden?: boolean } = {};

        if (flags.set === 'readonly') setOptions.readonly = true;
        if (flags.set === 'hidden') setOptions.hidden = true;
        if (flags.unset === 'readonly') setOptions.readonly = false;
        if (flags.unset === 'hidden') setOptions.hidden = false;

        const result = await setFileAttributes(filePath, setOptions);

        if (!result.success) {
          return error(`Failed to set attributes: ${result.error}`);
        }

        const newAttrs = await getFileAttributes(filePath);
        return success(
          {
            path: filePath,
            action: 'modified',
            attributes: newAttrs,
          },
          `Attributes updated for: ${filePath}`,
        );
      }

      // Just show attributes
      const attrs = await getFileAttributes(filePath);

      const output = [
        chalk.cyan('\n=== File Attributes ===\n'),
        chalk.white(`Path: ${filePath}`),
        '',
        `  Readonly: ${attrs.readonly ? chalk.yellow('Yes') : 'No'}`,
        `  Hidden: ${attrs.hidden ? chalk.yellow('Yes') : 'No'}`,
        `  System: ${attrs.system ? chalk.yellow('Yes') : 'No'}`,
        `  Archive: ${attrs.archive ? 'Yes' : 'No'}`,
      ];

      if (attrs.raw) {
        output.push(`  Raw: ${attrs.raw}`);
      }

      return success(attrs, output.join('\n'));
    } catch (err) {
      return error(createFailedMessage('get attributes', err));
    }
  },

  /**
   * Detect file encoding (UTF-8, ASCII, UTF-16, binary, etc.)
   */
  async encoding(args: string[]): Promise<CommandResult> {
    if (!args[0]) {
      return error(
        'Usage: /fs encoding <path>\n\nDetects file encoding (UTF-8, ASCII, UTF-16, binary, etc.)',
      );
    }

    try {
      const enc = await detectFileEncoding(args[0]);

      const confidenceColor =
        enc.confidence >= 90 ? chalk.green : enc.confidence >= 70 ? chalk.yellow : chalk.red;

      const output = [
        chalk.cyan('\n=== File Encoding ===\n'),
        chalk.white(`Path: ${args[0]}`),
        '',
        `  Encoding: ${chalk.bold(enc.encoding)}`,
        `  Confidence: ${confidenceColor(`${enc.confidence}%`)}`,
        `  BOM: ${enc.bom || 'None'}`,
        `  Details: ${enc.details}`,
      ];

      return success(enc, output.join('\n'));
    } catch (err) {
      return error(createFailedMessage('detect encoding', err));
    }
  },
};
