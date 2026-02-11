/**
 * NativeLSPLanguages - Language Server Protocol configuration for ~30 languages
 *
 * Based on Serena's solidlsp language server configurations.
 * Provides automatic language detection and LSP server setup.
 */

// ============================================================
// Types
// ============================================================

export interface LanguageServerConfig {
  /** Language identifier (LSP languageId) */
  languageId: string;
  /** Display name */
  displayName: string;
  /** File extensions (with dot) */
  extensions: string[];
  /** Command to start the language server */
  serverCommand: string;
  /** Command arguments */
  serverArgs?: string[];
  /** Initialization options */
  initOptions?: Record<string, unknown>;
  /** Server capabilities to request */
  capabilities?: string[];
  /** Whether server supports workspace symbols */
  supportsWorkspaceSymbols?: boolean;
  /** Whether server supports go to definition */
  supportsGoToDefinition?: boolean;
  /** Whether server supports find references */
  supportsFindReferences?: boolean;
  /** Whether server supports rename */
  supportsRename?: boolean;
  /** Whether server supports document symbols */
  supportsDocumentSymbols?: boolean;
  /** Installation notes */
  installNotes?: string;
  /** npm package to install (if applicable) */
  npmPackage?: string;
  /** pip package to install (if applicable) */
  pipPackage?: string;
}

// ============================================================
// Language Server Configurations
// ============================================================

export const LANGUAGE_SERVERS: LanguageServerConfig[] = [
  // ========================================================
  // JavaScript/TypeScript Family
  // ========================================================
  {
    languageId: 'typescript',
    displayName: 'TypeScript',
    extensions: ['.ts', '.mts', '.cts'],
    serverCommand: 'typescript-language-server',
    serverArgs: ['--stdio'],
    npmPackage: 'typescript-language-server typescript',
    supportsWorkspaceSymbols: true,
    supportsGoToDefinition: true,
    supportsFindReferences: true,
    supportsRename: true,
    supportsDocumentSymbols: true,
  },
  {
    languageId: 'typescriptreact',
    displayName: 'TypeScript React (TSX)',
    extensions: ['.tsx'],
    serverCommand: 'typescript-language-server',
    serverArgs: ['--stdio'],
    npmPackage: 'typescript-language-server typescript',
    supportsWorkspaceSymbols: true,
    supportsGoToDefinition: true,
    supportsFindReferences: true,
    supportsRename: true,
    supportsDocumentSymbols: true,
  },
  {
    languageId: 'javascript',
    displayName: 'JavaScript',
    extensions: ['.js', '.mjs', '.cjs'],
    serverCommand: 'typescript-language-server',
    serverArgs: ['--stdio'],
    npmPackage: 'typescript-language-server typescript',
    supportsWorkspaceSymbols: true,
    supportsGoToDefinition: true,
    supportsFindReferences: true,
    supportsRename: true,
    supportsDocumentSymbols: true,
  },
  {
    languageId: 'javascriptreact',
    displayName: 'JavaScript React (JSX)',
    extensions: ['.jsx'],
    serverCommand: 'typescript-language-server',
    serverArgs: ['--stdio'],
    npmPackage: 'typescript-language-server typescript',
    supportsWorkspaceSymbols: true,
    supportsGoToDefinition: true,
    supportsFindReferences: true,
    supportsRename: true,
    supportsDocumentSymbols: true,
  },
  {
    languageId: 'vue',
    displayName: 'Vue',
    extensions: ['.vue'],
    serverCommand: 'vue-language-server',
    serverArgs: ['--stdio'],
    npmPackage: '@vue/language-server',
    supportsWorkspaceSymbols: true,
    supportsGoToDefinition: true,
    supportsFindReferences: true,
    supportsRename: true,
    supportsDocumentSymbols: true,
  },

  // ========================================================
  // Python
  // ========================================================
  {
    languageId: 'python',
    displayName: 'Python',
    extensions: ['.py', '.pyw', '.pyi'],
    serverCommand: 'pyright-langserver',
    serverArgs: ['--stdio'],
    pipPackage: 'pyright',
    initOptions: {
      python: {
        analysis: {
          autoSearchPaths: true,
          useLibraryCodeForTypes: true,
        },
      },
    },
    supportsWorkspaceSymbols: true,
    supportsGoToDefinition: true,
    supportsFindReferences: true,
    supportsRename: true,
    supportsDocumentSymbols: true,
  },

  // ========================================================
  // Rust
  // ========================================================
  {
    languageId: 'rust',
    displayName: 'Rust',
    extensions: ['.rs'],
    serverCommand: 'rust-analyzer',
    supportsWorkspaceSymbols: true,
    supportsGoToDefinition: true,
    supportsFindReferences: true,
    supportsRename: true,
    supportsDocumentSymbols: true,
    installNotes: 'Install via rustup: rustup component add rust-analyzer',
  },

  // ========================================================
  // Go
  // ========================================================
  {
    languageId: 'go',
    displayName: 'Go',
    extensions: ['.go'],
    serverCommand: 'gopls',
    supportsWorkspaceSymbols: true,
    supportsGoToDefinition: true,
    supportsFindReferences: true,
    supportsRename: true,
    supportsDocumentSymbols: true,
    installNotes: 'Install via: go install golang.org/x/tools/gopls@latest',
  },

  // ========================================================
  // JVM Languages
  // ========================================================
  {
    languageId: 'java',
    displayName: 'Java',
    extensions: ['.java'],
    serverCommand: 'jdtls',
    supportsWorkspaceSymbols: true,
    supportsGoToDefinition: true,
    supportsFindReferences: true,
    supportsRename: true,
    supportsDocumentSymbols: true,
    installNotes: 'Install Eclipse JDT Language Server',
  },
  {
    languageId: 'kotlin',
    displayName: 'Kotlin',
    extensions: ['.kt', '.kts'],
    serverCommand: 'kotlin-language-server',
    supportsWorkspaceSymbols: true,
    supportsGoToDefinition: true,
    supportsFindReferences: true,
    supportsRename: true,
    supportsDocumentSymbols: true,
    installNotes: 'Install from https://github.com/fwcd/kotlin-language-server',
  },
  {
    languageId: 'scala',
    displayName: 'Scala',
    extensions: ['.scala', '.sc'],
    serverCommand: 'metals',
    supportsWorkspaceSymbols: true,
    supportsGoToDefinition: true,
    supportsFindReferences: true,
    supportsRename: true,
    supportsDocumentSymbols: true,
    installNotes: 'Install Metals via coursier',
  },
  {
    languageId: 'groovy',
    displayName: 'Groovy',
    extensions: ['.groovy', '.gvy', '.gy', '.gsh'],
    serverCommand: 'groovy-language-server',
    supportsWorkspaceSymbols: true,
    supportsGoToDefinition: true,
    supportsFindReferences: true,
    supportsRename: false,
    supportsDocumentSymbols: true,
  },

  // ========================================================
  // .NET Languages
  // ========================================================
  {
    languageId: 'csharp',
    displayName: 'C#',
    extensions: ['.cs'],
    serverCommand: 'OmniSharp',
    serverArgs: ['-lsp', '--hostPID', String(process.pid)],
    supportsWorkspaceSymbols: true,
    supportsGoToDefinition: true,
    supportsFindReferences: true,
    supportsRename: true,
    supportsDocumentSymbols: true,
    installNotes: 'Install OmniSharp from https://github.com/OmniSharp/omnisharp-roslyn',
  },
  {
    languageId: 'fsharp',
    displayName: 'F#',
    extensions: ['.fs', '.fsi', '.fsx'],
    serverCommand: 'fsautocomplete',
    supportsWorkspaceSymbols: true,
    supportsGoToDefinition: true,
    supportsFindReferences: true,
    supportsRename: true,
    supportsDocumentSymbols: true,
    installNotes: 'Install via: dotnet tool install -g fsautocomplete',
  },

  // ========================================================
  // C/C++
  // ========================================================
  {
    languageId: 'c',
    displayName: 'C',
    extensions: ['.c', '.h'],
    serverCommand: 'clangd',
    supportsWorkspaceSymbols: true,
    supportsGoToDefinition: true,
    supportsFindReferences: true,
    supportsRename: true,
    supportsDocumentSymbols: true,
    installNotes: 'Install clangd from LLVM',
  },
  {
    languageId: 'cpp',
    displayName: 'C++',
    extensions: ['.cpp', '.cc', '.cxx', '.hpp', '.hh', '.hxx'],
    serverCommand: 'clangd',
    supportsWorkspaceSymbols: true,
    supportsGoToDefinition: true,
    supportsFindReferences: true,
    supportsRename: true,
    supportsDocumentSymbols: true,
    installNotes: 'Install clangd from LLVM',
  },

  // ========================================================
  // Web Languages
  // ========================================================
  {
    languageId: 'php',
    displayName: 'PHP',
    extensions: ['.php', '.phtml'],
    serverCommand: 'intelephense',
    serverArgs: ['--stdio'],
    npmPackage: 'intelephense',
    supportsWorkspaceSymbols: true,
    supportsGoToDefinition: true,
    supportsFindReferences: true,
    supportsRename: true,
    supportsDocumentSymbols: true,
  },
  {
    languageId: 'ruby',
    displayName: 'Ruby',
    extensions: ['.rb', '.rake', '.gemspec'],
    serverCommand: 'ruby-lsp',
    supportsWorkspaceSymbols: true,
    supportsGoToDefinition: true,
    supportsFindReferences: true,
    supportsRename: false,
    supportsDocumentSymbols: true,
    installNotes: 'Install via: gem install ruby-lsp',
  },

  // ========================================================
  // Functional Languages
  // ========================================================
  {
    languageId: 'elixir',
    displayName: 'Elixir',
    extensions: ['.ex', '.exs'],
    serverCommand: 'elixir-ls',
    supportsWorkspaceSymbols: true,
    supportsGoToDefinition: true,
    supportsFindReferences: true,
    supportsRename: false,
    supportsDocumentSymbols: true,
    installNotes: 'Install ElixirLS from https://github.com/elixir-lsp/elixir-ls',
  },
  {
    languageId: 'erlang',
    displayName: 'Erlang',
    extensions: ['.erl', '.hrl'],
    serverCommand: 'erlang_ls',
    supportsWorkspaceSymbols: true,
    supportsGoToDefinition: true,
    supportsFindReferences: true,
    supportsRename: false,
    supportsDocumentSymbols: true,
  },
  {
    languageId: 'haskell',
    displayName: 'Haskell',
    extensions: ['.hs', '.lhs'],
    serverCommand: 'haskell-language-server-wrapper',
    serverArgs: ['--lsp'],
    supportsWorkspaceSymbols: true,
    supportsGoToDefinition: true,
    supportsFindReferences: true,
    supportsRename: true,
    supportsDocumentSymbols: true,
    installNotes: 'Install via ghcup',
  },
  {
    languageId: 'clojure',
    displayName: 'Clojure',
    extensions: ['.clj', '.cljs', '.cljc', '.edn'],
    serverCommand: 'clojure-lsp',
    supportsWorkspaceSymbols: true,
    supportsGoToDefinition: true,
    supportsFindReferences: true,
    supportsRename: true,
    supportsDocumentSymbols: true,
  },

  // ========================================================
  // Mobile/Apple
  // ========================================================
  {
    languageId: 'swift',
    displayName: 'Swift',
    extensions: ['.swift'],
    serverCommand: 'sourcekit-lsp',
    supportsWorkspaceSymbols: true,
    supportsGoToDefinition: true,
    supportsFindReferences: true,
    supportsRename: false,
    supportsDocumentSymbols: true,
    installNotes: 'Included with Xcode',
  },
  {
    languageId: 'dart',
    displayName: 'Dart',
    extensions: ['.dart'],
    serverCommand: 'dart',
    serverArgs: ['language-server', '--protocol=lsp'],
    supportsWorkspaceSymbols: true,
    supportsGoToDefinition: true,
    supportsFindReferences: true,
    supportsRename: true,
    supportsDocumentSymbols: true,
    installNotes: 'Included with Dart SDK',
  },

  // ========================================================
  // Scripting Languages
  // ========================================================
  {
    languageId: 'lua',
    displayName: 'Lua',
    extensions: ['.lua'],
    serverCommand: 'lua-language-server',
    supportsWorkspaceSymbols: true,
    supportsGoToDefinition: true,
    supportsFindReferences: true,
    supportsRename: true,
    supportsDocumentSymbols: true,
  },
  {
    languageId: 'perl',
    displayName: 'Perl',
    extensions: ['.pl', '.pm'],
    serverCommand: 'perl',
    serverArgs: ['-MPerl::LanguageServer', '-e', 'Perl::LanguageServer->run'],
    supportsWorkspaceSymbols: true,
    supportsGoToDefinition: true,
    supportsFindReferences: false,
    supportsRename: false,
    supportsDocumentSymbols: true,
  },
  {
    languageId: 'r',
    displayName: 'R',
    extensions: ['.r', '.R'],
    serverCommand: 'R',
    serverArgs: ['--slave', '-e', 'languageserver::run()'],
    supportsWorkspaceSymbols: true,
    supportsGoToDefinition: true,
    supportsFindReferences: true,
    supportsRename: false,
    supportsDocumentSymbols: true,
  },
  {
    languageId: 'julia',
    displayName: 'Julia',
    extensions: ['.jl'],
    serverCommand: 'julia',
    serverArgs: [
      '--startup-file=no',
      '--history-file=no',
      '-e',
      'using LanguageServer; runserver()',
    ],
    supportsWorkspaceSymbols: true,
    supportsGoToDefinition: true,
    supportsFindReferences: true,
    supportsRename: true,
    supportsDocumentSymbols: true,
  },

  // ========================================================
  // Shell/System
  // ========================================================
  {
    languageId: 'shellscript',
    displayName: 'Bash/Shell',
    extensions: ['.sh', '.bash', '.zsh'],
    serverCommand: 'bash-language-server',
    serverArgs: ['start'],
    npmPackage: 'bash-language-server',
    supportsWorkspaceSymbols: true,
    supportsGoToDefinition: true,
    supportsFindReferences: true,
    supportsRename: false,
    supportsDocumentSymbols: true,
  },
  {
    languageId: 'powershell',
    displayName: 'PowerShell',
    extensions: ['.ps1', '.psm1', '.psd1'],
    serverCommand: 'pwsh',
    serverArgs: [
      '-NoLogo',
      '-NoProfile',
      '-Command',
      'Import-Module PowerShellEditorServices; Start-EditorServices',
    ],
    supportsWorkspaceSymbols: true,
    supportsGoToDefinition: true,
    supportsFindReferences: true,
    supportsRename: true,
    supportsDocumentSymbols: true,
  },

  // ========================================================
  // Systems Languages
  // ========================================================
  {
    languageId: 'zig',
    displayName: 'Zig',
    extensions: ['.zig'],
    serverCommand: 'zls',
    supportsWorkspaceSymbols: true,
    supportsGoToDefinition: true,
    supportsFindReferences: true,
    supportsRename: true,
    supportsDocumentSymbols: true,
    installNotes: 'Install from https://github.com/zigtools/zls',
  },
  {
    languageId: 'nim',
    displayName: 'Nim',
    extensions: ['.nim', '.nims'],
    serverCommand: 'nimlsp',
    supportsWorkspaceSymbols: true,
    supportsGoToDefinition: true,
    supportsFindReferences: false,
    supportsRename: false,
    supportsDocumentSymbols: true,
    installNotes: 'Install via: nimble install nimlsp',
  },
  {
    languageId: 'pascal',
    displayName: 'Pascal',
    extensions: ['.pas', '.pp'],
    serverCommand: 'pasls',
    supportsWorkspaceSymbols: true,
    supportsGoToDefinition: true,
    supportsFindReferences: true,
    supportsRename: false,
    supportsDocumentSymbols: true,
  },
  {
    languageId: 'fortran',
    displayName: 'Fortran',
    extensions: ['.f', '.f90', '.f95', '.f03', '.f08'],
    serverCommand: 'fortls',
    supportsWorkspaceSymbols: true,
    supportsGoToDefinition: true,
    supportsFindReferences: false,
    supportsRename: true,
    supportsDocumentSymbols: true,
    pipPackage: 'fortran-language-server',
  },

  // ========================================================
  // Configuration/Data Languages
  // ========================================================
  {
    languageId: 'yaml',
    displayName: 'YAML',
    extensions: ['.yaml', '.yml'],
    serverCommand: 'yaml-language-server',
    serverArgs: ['--stdio'],
    npmPackage: 'yaml-language-server',
    supportsWorkspaceSymbols: false,
    supportsGoToDefinition: false,
    supportsFindReferences: false,
    supportsRename: false,
    supportsDocumentSymbols: true,
  },
  {
    languageId: 'toml',
    displayName: 'TOML',
    extensions: ['.toml'],
    serverCommand: 'taplo',
    serverArgs: ['lsp', 'stdio'],
    supportsWorkspaceSymbols: false,
    supportsGoToDefinition: false,
    supportsFindReferences: false,
    supportsRename: false,
    supportsDocumentSymbols: true,
  },
  {
    languageId: 'markdown',
    displayName: 'Markdown',
    extensions: ['.md', '.markdown'],
    serverCommand: 'marksman',
    supportsWorkspaceSymbols: true,
    supportsGoToDefinition: true,
    supportsFindReferences: true,
    supportsRename: false,
    supportsDocumentSymbols: true,
  },
];

// ============================================================
// Helper Functions
// ============================================================

/**
 * Get language config by extension
 */
export function getLanguageByExtension(ext: string): LanguageServerConfig | undefined {
  const normalizedExt = ext.startsWith('.') ? ext : `.${ext}`;
  return LANGUAGE_SERVERS.find((lang) => lang.extensions.includes(normalizedExt.toLowerCase()));
}

/**
 * Get language config by languageId
 */
export function getLanguageById(id: string): LanguageServerConfig | undefined {
  return LANGUAGE_SERVERS.find((lang) => lang.languageId.toLowerCase() === id.toLowerCase());
}

/**
 * Get all supported extensions
 */
export function getAllSupportedExtensions(): string[] {
  const extensions = new Set<string>();
  for (const lang of LANGUAGE_SERVERS) {
    for (const ext of lang.extensions) {
      extensions.add(ext);
    }
  }
  return Array.from(extensions);
}

/**
 * Get all language IDs
 */
export function getAllLanguageIds(): string[] {
  return LANGUAGE_SERVERS.map((lang) => lang.languageId);
}

/**
 * Check if extension is supported
 */
export function isExtensionSupported(ext: string): boolean {
  return getLanguageByExtension(ext) !== undefined;
}

/**
 * Detect language from file path
 */
export function detectLanguageFromPath(filePath: string): LanguageServerConfig | undefined {
  const ext = filePath.substring(filePath.lastIndexOf('.'));
  return getLanguageByExtension(ext);
}

/**
 * Get languages that support a capability
 */
export function getLanguagesWithCapability(
  capability:
    | 'workspaceSymbols'
    | 'goToDefinition'
    | 'findReferences'
    | 'rename'
    | 'documentSymbols',
): LanguageServerConfig[] {
  const capabilityMap: Record<string, keyof LanguageServerConfig> = {
    workspaceSymbols: 'supportsWorkspaceSymbols',
    goToDefinition: 'supportsGoToDefinition',
    findReferences: 'supportsFindReferences',
    rename: 'supportsRename',
    documentSymbols: 'supportsDocumentSymbols',
  };

  const key = capabilityMap[capability];
  return LANGUAGE_SERVERS.filter((lang) => lang[key] === true);
}

/**
 * Get language statistics
 */
export function getLanguageStats(): {
  total: number;
  withWorkspaceSymbols: number;
  withGoToDefinition: number;
  withFindReferences: number;
  withRename: number;
  withDocumentSymbols: number;
} {
  return {
    total: LANGUAGE_SERVERS.length,
    withWorkspaceSymbols: LANGUAGE_SERVERS.filter((l) => l.supportsWorkspaceSymbols).length,
    withGoToDefinition: LANGUAGE_SERVERS.filter((l) => l.supportsGoToDefinition).length,
    withFindReferences: LANGUAGE_SERVERS.filter((l) => l.supportsFindReferences).length,
    withRename: LANGUAGE_SERVERS.filter((l) => l.supportsRename).length,
    withDocumentSymbols: LANGUAGE_SERVERS.filter((l) => l.supportsDocumentSymbols).length,
  };
}

export default LANGUAGE_SERVERS;
