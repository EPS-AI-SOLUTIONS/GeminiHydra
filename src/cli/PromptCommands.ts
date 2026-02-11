/**
 * PromptCommands - Komendy CLI do zarządzania pamięcią promptów
 *
 * Komendy:
 * - /prompt save <title> - zapisz ostatni prompt
 * - /prompt list [category] - lista promptów
 * - /prompt search <query> - wyszukaj prompty
 * - /prompt use <id> - użyj zapisanego prompta
 * - /prompt fav <id> - dodaj/usuń z ulubionych
 * - /prompt delete <id> - usuń prompt
 * - /prompt export [file] - eksportuj prompty
 * - /prompt import <file> - importuj prompty
 * - /prompt suggest - sugestie na podstawie kontekstu
 * - /prompt stats - statystyki
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import {
  type PromptCategory,
  type PromptSearchOptions,
  promptMemory,
  type SavedPrompt,
} from '../memory/PromptMemory.js';

// ============================================================
// Command Handler Type
// ============================================================

export interface PromptCommandResult {
  success: boolean;
  message?: string;
  prompt?: SavedPrompt;
  prompts?: SavedPrompt[];
  compiledPrompt?: string;
}

// ============================================================
// Command Implementation
// ============================================================

export class PromptCommands {
  private lastUserInput: string = '';
  private lastContext: string = '';

  /**
   * Ustaw ostatni input użytkownika (dla /prompt save)
   */
  setLastInput(input: string): void {
    this.lastUserInput = input;
  }

  /**
   * Ustaw kontekst (dla sugestii)
   */
  setContext(context: string): void {
    this.lastContext = context;
  }

  /**
   * Główny handler komend /prompt
   */
  async handle(args: string[]): Promise<PromptCommandResult> {
    if (args.length === 0) {
      return this.showHelp();
    }

    const subcommand = args[0].toLowerCase();
    const subArgs = args.slice(1);

    switch (subcommand) {
      case 'save':
      case 's':
        return this.savePrompt(subArgs);

      case 'list':
      case 'ls':
      case 'l':
        return this.listPrompts(subArgs);

      case 'search':
      case 'find':
      case 'f':
        return this.searchPrompts(subArgs);

      case 'use':
      case 'u':
      case 'run':
        return this.usePrompt(subArgs);

      case 'show':
      case 'get':
      case 'g':
        return this.showPrompt(subArgs);

      case 'fav':
      case 'favorite':
      case 'star':
        return this.toggleFavorite(subArgs);

      case 'delete':
      case 'del':
      case 'rm':
        return this.deletePrompt(subArgs);

      case 'edit':
      case 'e':
        return this.editPrompt(subArgs);

      case 'rate':
        return this.ratePrompt(subArgs);

      case 'export':
        return this.exportPrompts(subArgs);

      case 'import':
        return this.importPrompts(subArgs);

      case 'suggest':
      case 'sug':
        return this.getSuggestions();

      case 'stats':
      case 'status':
        return this.showStats();

      case 'help':
      case 'h':
      case '?':
        return this.showHelp();

      default:
        // Może to ID prompta - spróbuj go użyć
        if (subcommand.length === 16) {
          return this.usePrompt([subcommand, ...subArgs]);
        }
        return {
          success: false,
          message: `Nieznana komenda: ${subcommand}. Użyj /prompt help`,
        };
    }
  }

  // ============================================================
  // Save Command
  // ============================================================

  private async savePrompt(args: string[]): Promise<PromptCommandResult> {
    if (args.length === 0 && !this.lastUserInput) {
      return {
        success: false,
        message: 'Użycie: /prompt save <tytuł> [#tag1 #tag2] lub po wpisaniu prompta',
      };
    }

    // Parse title and tags from args
    let title = '';
    const tags: string[] = [];
    let content = this.lastUserInput;

    for (const arg of args) {
      if (arg.startsWith('#')) {
        tags.push(arg.slice(1).toLowerCase());
      } else if (arg.startsWith('@')) {
        // @category
        // będzie użyte później
      } else {
        title += (title ? ' ' : '') + arg;
      }
    }

    // If no title and we have content, use first line
    if (!title && content) {
      title = content.split('\n')[0].slice(0, 50);
      if (content.length > 50) title += '...';
    }

    if (!title) {
      return {
        success: false,
        message: 'Podaj tytuł dla prompta',
      };
    }

    if (!content) {
      // Use args as content if no last input
      content = args.filter((a) => !a.startsWith('#') && !a.startsWith('@')).join(' ');
      title = content.slice(0, 50);
    }

    try {
      const prompt = await promptMemory.savePrompt({
        title,
        content,
        tags,
      });

      console.log(chalk.green(`\n✓ Prompt zapisany!`));
      console.log(chalk.gray(`  ID: ${prompt.id}`));
      console.log(chalk.gray(`  Tytuł: ${prompt.title}`));
      console.log(chalk.gray(`  Kategoria: ${prompt.category}`));
      if (prompt.tags.length > 0) {
        console.log(chalk.gray(`  Tagi: ${prompt.tags.map((t) => `#${t}`).join(' ')}`));
      }
      if (prompt.variables && prompt.variables.length > 0) {
        console.log(
          chalk.gray(`  Zmienne: ${prompt.variables.map((v) => `{{${v.name}}}`).join(', ')}`),
        );
      }
      console.log('');

      return { success: true, prompt };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Błąd zapisu: ${msg}`,
      };
    }
  }

  // ============================================================
  // List Command
  // ============================================================

  private async listPrompts(args: string[]): Promise<PromptCommandResult> {
    const options: PromptSearchOptions = {
      limit: 20,
      sortBy: 'recent',
    };

    // Parse args
    for (const arg of args) {
      if (arg === '--fav' || arg === '-f') {
        options.onlyFavorites = true;
      } else if (arg === '--usage' || arg === '-u') {
        options.sortBy = 'usage';
      } else if (arg === '--rating' || arg === '-r') {
        options.sortBy = 'rating';
      } else if (arg.startsWith('#')) {
        options.tags = options.tags || [];
        options.tags.push(arg.slice(1));
      } else {
        // Może to kategoria
        const cat = arg.toLowerCase() as PromptCategory;
        if (
          [
            'coding',
            'analysis',
            'refactoring',
            'debugging',
            'testing',
            'docs',
            'git',
            'architecture',
            'review',
            'explain',
            'translate',
            'custom',
          ].includes(cat)
        ) {
          options.category = cat;
        }
      }
    }

    const prompts = await promptMemory.searchPrompts(options);

    console.log(chalk.cyan('\n═══ Zapisane Prompty ═══\n'));

    if (prompts.length === 0) {
      console.log(chalk.gray('Brak zapisanych promptów.'));
      console.log(chalk.gray('Użyj /prompt save <tytuł> aby zapisać prompt.\n'));
      return { success: true, prompts: [] };
    }

    const favorites = await promptMemory.getFavorites();
    const favIds = favorites.map((f) => f.id);

    for (const p of prompts) {
      const star = favIds.includes(p.id) ? chalk.yellow('★') : chalk.gray('○');
      const rating = p.rating ? chalk.yellow('★'.repeat(p.rating) + '☆'.repeat(5 - p.rating)) : '';
      const usage = p.usageCount > 0 ? chalk.gray(` (${p.usageCount}x)`) : '';

      console.log(`${star} ${chalk.white(p.id.slice(0, 8))} ${chalk.cyan(p.title)}${usage}`);
      console.log(
        chalk.gray(`    [${p.category}] ${p.tags.map((t) => `#${t}`).join(' ')} ${rating}`),
      );
    }

    console.log(chalk.gray(`\nPokazano ${prompts.length} promptów`));
    console.log(chalk.gray('Użyj /prompt use <id> aby użyć prompta\n'));

    return { success: true, prompts };
  }

  // ============================================================
  // Search Command
  // ============================================================

  private async searchPrompts(args: string[]): Promise<PromptCommandResult> {
    if (args.length === 0) {
      return {
        success: false,
        message: 'Użycie: /prompt search <zapytanie>',
      };
    }

    const query = args.join(' ');
    const prompts = await promptMemory.searchPrompts({
      query,
      sortBy: 'relevance',
      limit: 10,
    });

    console.log(chalk.cyan(`\n═══ Wyniki dla "${query}" ═══\n`));

    if (prompts.length === 0) {
      console.log(chalk.gray('Brak wyników.\n'));
      return { success: true, prompts: [] };
    }

    for (const p of prompts) {
      console.log(`${chalk.white(p.id.slice(0, 8))} ${chalk.cyan(p.title)}`);
      console.log(chalk.gray(`    ${p.content.slice(0, 80)}${p.content.length > 80 ? '...' : ''}`));
    }

    console.log('');
    return { success: true, prompts };
  }

  // ============================================================
  // Use Command
  // ============================================================

  private async usePrompt(args: string[]): Promise<PromptCommandResult> {
    if (args.length === 0) {
      return {
        success: false,
        message: 'Użycie: /prompt use <id> [zmienna=wartość ...]',
      };
    }

    const idPrefix = args[0];
    const varArgs = args.slice(1);

    // Find prompt by ID prefix
    const allPrompts = await promptMemory.getAllPrompts();
    const matches = allPrompts.filter((p) => p.id.startsWith(idPrefix));

    if (matches.length === 0) {
      return {
        success: false,
        message: `Nie znaleziono prompta o ID rozpoczynającym się od: ${idPrefix}`,
      };
    }

    if (matches.length > 1) {
      console.log(chalk.yellow(`\nZnaleziono ${matches.length} pasujących promptów:`));
      matches.forEach((p) => {
        console.log(chalk.gray(`  ${p.id.slice(0, 8)} - ${p.title}`));
      });
      return {
        success: false,
        message: 'Podaj bardziej precyzyjny ID',
      };
    }

    const prompt = matches[0];

    // Parse variables from args
    const variables: Record<string, string> = {};
    for (const arg of varArgs) {
      const eqIndex = arg.indexOf('=');
      if (eqIndex > 0) {
        const key = arg.slice(0, eqIndex);
        const value = arg.slice(eqIndex + 1);
        variables[key] = value;
      }
    }

    // Check for missing required variables
    if (prompt.variables) {
      const missing = prompt.variables.filter(
        (v) => v.required && !variables[v.name] && !v.defaultValue,
      );

      if (missing.length > 0) {
        console.log(chalk.yellow(`\nBrakujące zmienne dla "${prompt.title}":`));
        missing.forEach((v) => {
          console.log(chalk.gray(`  {{${v.name}}}${v.description ? ` - ${v.description}` : ''}`));
        });
        return {
          success: false,
          message: `Podaj brakujące zmienne: ${missing.map((v) => `${v.name}=...`).join(' ')}`,
        };
      }
    }

    // Compile prompt
    const compiledPrompt = promptMemory.compilePrompt(prompt, variables);

    // Record usage
    await promptMemory.recordUsage(prompt.id, {
      context: this.lastContext,
      variables,
    });

    console.log(chalk.green(`\n✓ Prompt "${prompt.title}" gotowy:\n`));
    console.log(chalk.white(compiledPrompt));
    console.log('');

    return {
      success: true,
      prompt,
      compiledPrompt,
    };
  }

  // ============================================================
  // Show Command
  // ============================================================

  private async showPrompt(args: string[]): Promise<PromptCommandResult> {
    if (args.length === 0) {
      return {
        success: false,
        message: 'Użycie: /prompt show <id>',
      };
    }

    const idPrefix = args[0];
    const allPrompts = await promptMemory.getAllPrompts();
    const prompt = allPrompts.find((p) => p.id.startsWith(idPrefix));

    if (!prompt) {
      return {
        success: false,
        message: `Nie znaleziono prompta: ${idPrefix}`,
      };
    }

    const isFav = await promptMemory.isFavorite(prompt.id);

    console.log(chalk.cyan(`\n═══ ${prompt.title} ═══\n`));
    console.log(chalk.gray(`ID: ${prompt.id}`));
    console.log(chalk.gray(`Kategoria: ${prompt.category}`));
    console.log(chalk.gray(`Tagi: ${prompt.tags.map((t) => `#${t}`).join(' ') || 'brak'}`));
    console.log(chalk.gray(`Ulubiony: ${isFav ? 'tak' : 'nie'}`));
    console.log(chalk.gray(`Użycia: ${prompt.usageCount}`));
    if (prompt.rating) {
      console.log(
        chalk.gray(`Ocena: ${'★'.repeat(prompt.rating)}${'☆'.repeat(5 - prompt.rating)}`),
      );
    }
    console.log(chalk.gray(`Utworzono: ${prompt.createdAt.toLocaleString()}`));
    if (prompt.lastUsedAt) {
      console.log(chalk.gray(`Ostatnio używany: ${prompt.lastUsedAt.toLocaleString()}`));
    }

    if (prompt.variables && prompt.variables.length > 0) {
      console.log(chalk.gray('\nZmienne:'));
      prompt.variables.forEach((v) => {
        console.log(
          chalk.gray(`  {{${v.name}}}${v.required ? '*' : ''} - ${v.description || 'brak opisu'}`),
        );
      });
    }

    if (prompt.notes) {
      console.log(chalk.gray(`\nNotatki: ${prompt.notes}`));
    }

    console.log(chalk.cyan('\n--- Treść ---\n'));
    console.log(prompt.content);
    console.log('');

    return { success: true, prompt };
  }

  // ============================================================
  // Toggle Favorite
  // ============================================================

  private async toggleFavorite(args: string[]): Promise<PromptCommandResult> {
    if (args.length === 0) {
      return {
        success: false,
        message: 'Użycie: /prompt fav <id>',
      };
    }

    const idPrefix = args[0];
    const allPrompts = await promptMemory.getAllPrompts();
    const prompt = allPrompts.find((p) => p.id.startsWith(idPrefix));

    if (!prompt) {
      return {
        success: false,
        message: `Nie znaleziono prompta: ${idPrefix}`,
      };
    }

    const isFav = await promptMemory.toggleFavorite(prompt.id);

    if (isFav) {
      console.log(chalk.yellow(`\n★ "${prompt.title}" dodany do ulubionych\n`));
    } else {
      console.log(chalk.gray(`\n○ "${prompt.title}" usunięty z ulubionych\n`));
    }

    return { success: true, prompt };
  }

  // ============================================================
  // Delete Command
  // ============================================================

  private async deletePrompt(args: string[]): Promise<PromptCommandResult> {
    if (args.length === 0) {
      return {
        success: false,
        message: 'Użycie: /prompt delete <id>',
      };
    }

    const idPrefix = args[0];
    const allPrompts = await promptMemory.getAllPrompts();
    const prompt = allPrompts.find((p) => p.id.startsWith(idPrefix));

    if (!prompt) {
      return {
        success: false,
        message: `Nie znaleziono prompta: ${idPrefix}`,
      };
    }

    await promptMemory.deletePrompt(prompt.id);
    console.log(chalk.red(`\n✗ Usunięto prompt: "${prompt.title}"\n`));

    return { success: true };
  }

  // ============================================================
  // Edit Command
  // ============================================================

  private async editPrompt(args: string[]): Promise<PromptCommandResult> {
    if (args.length < 2) {
      return {
        success: false,
        message:
          'Użycie: /prompt edit <id> <pole>=<wartość>\n' +
          '  Pola: title, content, tags, notes, category',
      };
    }

    const idPrefix = args[0];
    const allPrompts = await promptMemory.getAllPrompts();
    const prompt = allPrompts.find((p) => p.id.startsWith(idPrefix));

    if (!prompt) {
      return {
        success: false,
        message: `Nie znaleziono prompta: ${idPrefix}`,
      };
    }

    const updates: Record<string, string | string[]> = {};

    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      const eqIndex = arg.indexOf('=');
      if (eqIndex > 0) {
        const field = arg.slice(0, eqIndex);
        const value = arg.slice(eqIndex + 1);

        switch (field) {
          case 'title':
            updates.title = value;
            break;
          case 'content':
            updates.content = value;
            break;
          case 'tags':
            updates.tags = value.split(',').map((t) => t.trim().replace(/^#/, ''));
            break;
          case 'notes':
            updates.notes = value;
            break;
          case 'category':
            updates.category = value as PromptCategory;
            break;
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return {
        success: false,
        message: 'Brak zmian do zapisania',
      };
    }

    const updated = await promptMemory.updatePrompt(prompt.id, updates);
    console.log(chalk.green(`\n✓ Zaktualizowano prompt: "${updated?.title}"\n`));

    return { success: true, prompt: updated || undefined };
  }

  // ============================================================
  // Rate Command
  // ============================================================

  private async ratePrompt(args: string[]): Promise<PromptCommandResult> {
    if (args.length < 2) {
      return {
        success: false,
        message: 'Użycie: /prompt rate <id> <1-5>',
      };
    }

    const idPrefix = args[0];
    const rating = parseInt(args[1], 10);

    if (Number.isNaN(rating) || rating < 1 || rating > 5) {
      return {
        success: false,
        message: 'Ocena musi być liczbą od 1 do 5',
      };
    }

    const allPrompts = await promptMemory.getAllPrompts();
    const prompt = allPrompts.find((p) => p.id.startsWith(idPrefix));

    if (!prompt) {
      return {
        success: false,
        message: `Nie znaleziono prompta: ${idPrefix}`,
      };
    }

    await promptMemory.ratePrompt(prompt.id, rating);
    console.log(
      chalk.yellow(`\n${'★'.repeat(rating)}${'☆'.repeat(5 - rating)} "${prompt.title}"\n`),
    );

    return { success: true, prompt };
  }

  // ============================================================
  // Export Command
  // ============================================================

  private async exportPrompts(args: string[]): Promise<PromptCommandResult> {
    const filename = args[0] || 'prompts-export.json';
    const filepath = path.resolve(filename);

    const json = await promptMemory.exportPrompts({
      includeHistory: args.includes('--history'),
    });

    await fs.writeFile(filepath, json, 'utf-8');
    console.log(chalk.green(`\n✓ Wyeksportowano prompty do: ${filepath}\n`));

    return { success: true };
  }

  // ============================================================
  // Import Command
  // ============================================================

  private async importPrompts(args: string[]): Promise<PromptCommandResult> {
    if (args.length === 0) {
      return {
        success: false,
        message: 'Użycie: /prompt import <plik.json> [--overwrite]',
      };
    }

    const filename = args[0];
    const overwrite = args.includes('--overwrite');

    try {
      const filepath = path.resolve(filename);
      const json = await fs.readFile(filepath, 'utf-8');

      const result = await promptMemory.importPrompts(json, { overwrite });

      console.log(chalk.green(`\n✓ Import zakończony`));
      console.log(chalk.gray(`  Zaimportowano: ${result.imported}`));
      console.log(chalk.gray(`  Pominięto (duplikaty): ${result.skipped}`));
      if (result.errors.length > 0) {
        console.log(chalk.red(`  Błędy: ${result.errors.length}`));
        for (const e of result.errors) console.log(chalk.red(`    - ${e}`));
      }
      console.log('');

      return { success: true };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Błąd importu: ${msg}`,
      };
    }
  }

  // ============================================================
  // Suggestions
  // ============================================================

  private async getSuggestions(): Promise<PromptCommandResult> {
    if (!this.lastContext) {
      return {
        success: false,
        message: 'Brak kontekstu do sugestii. Wpisz coś najpierw.',
      };
    }

    const suggestions = await promptMemory.getSuggestions(this.lastContext, 5);

    if (suggestions.length === 0) {
      console.log(chalk.gray('\nBrak sugestii dla aktualnego kontekstu.\n'));
      return { success: true, prompts: [] };
    }

    console.log(chalk.cyan('\n═══ Sugerowane Prompty ═══\n'));

    for (const s of suggestions) {
      const scoreBar =
        '█'.repeat(Math.round(s.score * 5)) + '░'.repeat(5 - Math.round(s.score * 5));
      console.log(
        `${chalk.gray(scoreBar)} ${chalk.white(s.prompt.id.slice(0, 8))} ${chalk.cyan(s.prompt.title)}`,
      );
      console.log(chalk.gray(`    ${s.reason}`));
    }

    console.log(chalk.gray('\nUżyj /prompt use <id> aby użyć prompta\n'));

    return { success: true, prompts: suggestions.map((s) => s.prompt) };
  }

  // ============================================================
  // Stats
  // ============================================================

  private async showStats(): Promise<PromptCommandResult> {
    await promptMemory.printSummary();
    return { success: true };
  }

  // ============================================================
  // Help
  // ============================================================

  private showHelp(): PromptCommandResult {
    console.log(chalk.cyan('\n═══ Prompt Memory - Pomoc ═══\n'));

    console.log(chalk.white('Zapisywanie i zarządzanie:'));
    console.log(`${chalk.gray('  /prompt save <tytuł> [#tag1 #tag2]')} - zapisz ostatni prompt`);
    console.log(`${chalk.gray('  /prompt list [kategoria] [--fav]')}  - lista promptów`);
    console.log(`${chalk.gray('  /prompt search <zapytanie>')}        - wyszukaj prompty`);
    console.log(`${chalk.gray('  /prompt show <id>')}                 - pokaż szczegóły`);
    console.log(`${chalk.gray('  /prompt edit <id> pole=wartość')}    - edytuj prompt`);
    console.log(`${chalk.gray('  /prompt delete <id>')}               - usuń prompt`);

    console.log(chalk.white('\nUżywanie:'));
    console.log(`${chalk.gray('  /prompt use <id> [zmienna=wartość]')} - użyj prompta`);
    console.log(`${chalk.gray('  /prompt suggest')}                    - sugestie dla kontekstu`);

    console.log(chalk.white('\nOcenianie i ulubione:'));
    console.log(`${chalk.gray('  /prompt fav <id>')}                  - dodaj/usuń z ulubionych`);
    console.log(`${chalk.gray('  /prompt rate <id> <1-5>')}           - oceń prompt`);

    console.log(chalk.white('\nImport/Export:'));
    console.log(`${chalk.gray('  /prompt export [plik]')}             - eksportuj prompty`);
    console.log(`${chalk.gray('  /prompt import <plik>')}             - importuj prompty`);

    console.log(chalk.white('\nStatystyki:'));
    console.log(`${chalk.gray('  /prompt stats')}                     - statystyki użycia`);

    console.log(chalk.white('\nKategorie:'));
    console.log(chalk.gray('  coding, analysis, refactoring, debugging, testing,'));
    console.log(chalk.gray('  docs, git, architecture, review, explain, translate, custom'));

    console.log(chalk.white('\nSzablony ze zmiennymi:'));
    console.log(chalk.gray('  Użyj {{zmienna}} w treści prompta'));
    console.log(chalk.gray('  Przykład: "Zrefaktoryzuj {{plik}} aby użyć {{pattern}}"'));
    console.log(chalk.gray('  Użycie: /prompt use abc123 plik=index.ts pattern=singleton'));

    console.log('');

    return { success: true };
  }
}

// ============================================================
// Singleton Export
// ============================================================

export const promptCommands = new PromptCommands();
