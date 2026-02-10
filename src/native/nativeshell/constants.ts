/**
 * NativeShell - Constants and static data
 *
 * Shell paths, command translations, fallback orders,
 * progress patterns, environment profiles, and script sandbox constants.
 *
 * @module native/nativeshell/constants
 */

import type {
  ShellType,
  CommandMapping,
  EnvironmentConfig,
  EnvironmentProfile,
  TimeoutProfile
} from './types.js';

// ============================================================
// Shell Constants and Mappings
// ============================================================

/**
 * Default shell paths for different platforms
 */
export const SHELL_PATHS: Record<ShellType, { windows: string[]; unix: string[] }> = {
  cmd: {
    windows: ['C:\\Windows\\System32\\cmd.exe', 'cmd.exe'],
    unix: []
  },
  powershell: {
    windows: [
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      'powershell.exe'
    ],
    unix: []
  },
  pwsh: {
    windows: [
      'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
      'C:\\Program Files (x86)\\PowerShell\\7\\pwsh.exe',
      'pwsh.exe'
    ],
    unix: ['/usr/local/bin/pwsh', '/usr/bin/pwsh', 'pwsh']
  },
  bash: {
    windows: [
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
      'C:\\Windows\\System32\\bash.exe',
      'bash.exe'
    ],
    unix: ['/bin/bash', '/usr/bin/bash', '/usr/local/bin/bash']
  },
  sh: {
    windows: [],
    unix: ['/bin/sh', '/usr/bin/sh']
  },
  zsh: {
    windows: [],
    unix: ['/bin/zsh', '/usr/bin/zsh', '/usr/local/bin/zsh']
  }
};

/**
 * Command translation map between shells
 * Maps common operations from one shell syntax to another
 */
export const COMMAND_TRANSLATIONS: CommandMapping[] = [
  // Directory listing
  { cmd: 'dir', powershell: 'Get-ChildItem', bash: 'ls' },
  { cmd: 'dir /b', powershell: 'Get-ChildItem -Name', bash: 'ls -1' },
  { cmd: 'dir /s', powershell: 'Get-ChildItem -Recurse', bash: 'ls -R' },
  { cmd: 'dir /a', powershell: 'Get-ChildItem -Force', bash: 'ls -la' },

  // File operations
  { cmd: 'copy', powershell: 'Copy-Item', bash: 'cp' },
  { cmd: 'xcopy', powershell: 'Copy-Item -Recurse', bash: 'cp -r' },
  { cmd: 'del', powershell: 'Remove-Item', bash: 'rm' },
  { cmd: 'del /q', powershell: 'Remove-Item -Force', bash: 'rm -f' },
  { cmd: 'rmdir', powershell: 'Remove-Item -Recurse', bash: 'rm -rf' },
  { cmd: 'rd /s /q', powershell: 'Remove-Item -Recurse -Force', bash: 'rm -rf' },
  { cmd: 'move', powershell: 'Move-Item', bash: 'mv' },
  { cmd: 'ren', powershell: 'Rename-Item', bash: 'mv' },
  { cmd: 'mkdir', powershell: 'New-Item -ItemType Directory', bash: 'mkdir' },
  { cmd: 'md', powershell: 'New-Item -ItemType Directory', bash: 'mkdir -p' },

  // File content
  { cmd: 'type', powershell: 'Get-Content', bash: 'cat' },
  { cmd: 'more', powershell: 'Get-Content | Out-Host -Paging', bash: 'less' },
  { cmd: 'find', powershell: 'Select-String', bash: 'grep' },
  { cmd: 'findstr', powershell: 'Select-String', bash: 'grep' },

  // Navigation
  { cmd: 'cd', powershell: 'Set-Location', bash: 'cd' },
  { cmd: 'chdir', powershell: 'Set-Location', bash: 'cd' },
  { cmd: 'pushd', powershell: 'Push-Location', bash: 'pushd' },
  { cmd: 'popd', powershell: 'Pop-Location', bash: 'popd' },

  // Environment
  { cmd: 'set', powershell: '$env:', bash: 'export' },
  { cmd: 'echo', powershell: 'Write-Output', bash: 'echo' },
  { cmd: 'cls', powershell: 'Clear-Host', bash: 'clear' },

  // Process
  { cmd: 'tasklist', powershell: 'Get-Process', bash: 'ps' },
  { cmd: 'taskkill', powershell: 'Stop-Process', bash: 'kill' },
  { cmd: 'taskkill /f', powershell: 'Stop-Process -Force', bash: 'kill -9' },

  // Network
  { cmd: 'ipconfig', powershell: 'Get-NetIPConfiguration', bash: 'ifconfig' },
  { cmd: 'ping', powershell: 'Test-Connection', bash: 'ping' },
  { cmd: 'netstat', powershell: 'Get-NetTCPConnection', bash: 'netstat' },

  // System info
  { cmd: 'hostname', powershell: '$env:COMPUTERNAME', bash: 'hostname' },
  { cmd: 'whoami', powershell: '$env:USERNAME', bash: 'whoami' },
  { cmd: 'ver', powershell: '$PSVersionTable', bash: 'uname -a' },

  // File attributes
  { cmd: 'attrib', powershell: 'Get-ItemProperty', bash: 'stat' },

  // Help
  { cmd: 'help', powershell: 'Get-Help', bash: 'man' }
];

/**
 * Shell fallback order for each platform
 */
export const SHELL_FALLBACK_ORDER: Record<'windows' | 'unix', ShellType[]> = {
  windows: ['powershell', 'pwsh', 'cmd', 'bash'],
  unix: ['bash', 'zsh', 'sh', 'pwsh']
};

// ============================================================
// Output and Progress Constants
// ============================================================

/**
 * Default maximum output buffer size (10MB)
 */
export const DEFAULT_MAX_OUTPUT_SIZE = 10 * 1024 * 1024;

/**
 * Default progress patterns for common tools
 */
export const DEFAULT_PROGRESS_PATTERNS: RegExp[] = [
  // Percentage patterns: "50%", "50.5%", "Progress: 50%"
  /(\d+(?:\.\d+)?)\s*%/,
  // Progress bar patterns: "[=====>    ]", "[#####     ]"
  /\[([=>#\-]+)\s*\]/,
  // Fraction patterns: "5/10", "5 of 10", "5 / 10"
  /(\d+)\s*(?:\/|of)\s*(\d+)/i,
  // Download patterns: "Downloading...", "downloading file.zip"
  /downloading\s+(.+)/i,
  // npm/yarn patterns: "added 100 packages"
  /added\s+(\d+)\s+packages?/i,
  // Git patterns: "Receiving objects: 50%"
  /(?:Receiving|Resolving|Compressing)\s+\w+:\s*(\d+)%/,
  // Pip patterns: "Installing collected packages"
  /Installing\s+(.+)/i,
  // Generic progress: "Step 1/5", "Stage 2 of 4"
  /(?:Step|Stage)\s+(\d+)\s*(?:\/|of)\s*(\d+)/i
];

// ============================================================
// Timeout Constants
// ============================================================

/**
 * Timeout profile values in milliseconds
 */
export const TIMEOUT_PROFILES: Record<TimeoutProfile, number> = {
  quick: 10000,    // 10 seconds - for simple commands
  normal: 120000,  // 2 minutes - default for most operations
  long: 300000,    // 5 minutes - for longer operations
  build: 600000    // 10 minutes - for build processes
};

// ============================================================
// Environment Constants
// ============================================================

/**
 * Sensitive environment variable patterns for filtering from logs
 */
export const SENSITIVE_ENV_PATTERNS: RegExp[] = [
  /API[_-]?KEY/i,
  /SECRET/i,
  /PASSWORD/i,
  /TOKEN/i,
  /PRIVATE[_-]?KEY/i,
  /CREDENTIAL/i,
  /AUTH/i,
  /ACCESS[_-]?KEY/i,
  /SESSION[_-]?KEY/i,
  /ENCRYPT/i
];

/**
 * Default blocked environment variables
 */
export const DEFAULT_BLOCKED_ENV_VARS: string[] = [
  'NPM_TOKEN',
  'GITHUB_TOKEN',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AZURE_CLIENT_SECRET',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'DATABASE_PASSWORD',
  'DB_PASSWORD',
  'REDIS_PASSWORD',
  'MONGO_PASSWORD',
  'JWT_SECRET',
  'ENCRYPTION_KEY',
  'PRIVATE_KEY'
];

/**
 * Predefined environment profiles with their settings
 */
export const ENVIRONMENT_PROFILES: Record<EnvironmentProfile, Partial<EnvironmentConfig>> = {
  development: {
    inheritEnv: true,
    additionalEnv: {
      NODE_ENV: 'development',
      DEBUG: '*',
      LOG_LEVEL: 'debug'
    },
    blockedEnvVars: []
  },
  production: {
    inheritEnv: true,
    additionalEnv: {
      NODE_ENV: 'production',
      LOG_LEVEL: 'info'
    },
    blockedEnvVars: [...DEFAULT_BLOCKED_ENV_VARS]
  },
  test: {
    inheritEnv: false,
    additionalEnv: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'warn',
      CI: 'true'
    },
    blockedEnvVars: [...DEFAULT_BLOCKED_ENV_VARS]
  }
};

// ============================================================
// Script Sandbox Constants
// ============================================================

/**
 * Allowed file extensions for script validation
 */
export const ALLOWED_SCRIPT_EXTENSIONS: Record<string, string[]> = {
  python: ['.py', '.pyw'],
  node: ['.js', '.mjs', '.cjs'],
  bash: ['.sh', '.bash'],
  powershell: ['.ps1', '.psm1', '.psd1']
};

/**
 * Python sandbox - restricted imports
 * These modules are blocked in sandbox mode
 */
export const PYTHON_SANDBOX_BLOCKED_IMPORTS = [
  'os',
  'subprocess',
  'sys',
  'shutil',
  'socket',
  'ctypes',
  'multiprocessing',
  'threading',
  '_thread',
  'asyncio.subprocess',
  'importlib',
  '__import__',
  'builtins',
  'code',
  'codeop',
  'pty',
  'pdb',
  'pickle',
  'shelve',
  'tempfile',
  'pathlib',
  'glob',
  'fnmatch',
  'linecache',
  'zipimport',
  'pkgutil',
  'modulefinder',
  'runpy'
];
