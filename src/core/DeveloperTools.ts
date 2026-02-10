/**
 * @deprecated This file is a backward-compatibility shim.
 * All functionality has been modularized into src/core/developer/.
 *
 * For new code, import directly from './developer/index.js' instead.
 * This re-export file will be removed in a future version.
 *
 * @module DeveloperTools
 */

// Re-export everything from the modular developer subpackage
// Note: detectLanguage is renamed to detectFileLanguage to avoid conflict
// with SemanticChunking.detectLanguage exported from intelligence/index.js
export {
  // Feature #31: Code Review
  reviewCode,
  formatCodeReview,
  detectLanguage as detectFileLanguage,
  type CodeReviewIssue,
  type CodeReviewResult,

  // Feature #32: Test Generation
  generateTests,
  formatGeneratedTests,
  generateTestFileContent,
  getDefaultTestFramework,
  getTestFileName,
  type GeneratedTest,
  type TestGenerationResult,
  type TestGenerationOptions,

  // Feature #33: Documentation Generation
  generateDocumentation,
  formatDocumentation,
  generateJSDoc,
  generateTableOfContents,
  type DocEntry,
  type DocParam,
  type DocReturn,
  type DocumentationResult,
  type DocumentationFormat,

  // Feature #34: Refactoring Analysis
  analyzeRefactoring,
  formatRefactoringAnalysis,
  getSuggestionDetails,
  filterSuggestionsByType,
  calculateTotalEffort,
  type RefactoringSuggestion,
  type RefactoringAnalysis,
  type RefactoringType,
  type RefactoringPriority,
  type RefactoringEffort,
  type CodeMetrics,

  // Feature #35: Performance Profiling
  profilePerformance,
  formatPerformanceProfile,
  filterIssuesByCategory,
  getIssueSummaryByCategory,
  calculateSeverityScore,
  hasCriticalIssues,
  type PerformanceIssue,
  type PerformanceProfile,
  type PerformanceHotspot,
  type PerformanceOptimization,
  type PerformanceSeverity,
  type PerformanceCategory,

  // Feature #36: Security Scanning
  scanSecurity,
  formatSecurityScan,
  type SecurityVulnerability,
  type SecurityScanResult,

  // Feature #37: Dependency Analysis
  analyzeDependencies,
  groupDependenciesByType,
  findDependencies,
  formatDependencyAnalysis,
  generateDependencyReport,
  type DependencyInfo,
  type DependencyAnalysis,

  // Feature #38: API Mocking
  generateMockEndpoints,
  generateMockData,
  generateMockList,
  generateMockServer,
  generateMockHandler,
  formatMockApiConfig,
  type MockEndpoint,
  type MockApiConfig,
  type ApiEndpointSpec,
  type MockServerOptions,

  // Feature #39: Environment Management
  EnvManager,
  envManager,
  formatEnvironments,
  type EnvironmentConfig,
  type EnvironmentManagerState,
  type EnvironmentValidationResult,

  // Feature #40: Multi-Project Support
  MultiProjectManager,
  projectManager,
  formatProjectList,
  formatRecentProjects,
  type ProjectType,
  type ProjectInfo,
  type ProjectWorkspace,
  type ProjectFilter,

  // Initialization
  initDeveloperModules
} from './developer/index.js';

// Backward-compatible alias
export { initDeveloperModules as initDeveloperTools } from './developer/index.js';

// Re-export default for backward compatibility
export { default } from './developer/index.js';
