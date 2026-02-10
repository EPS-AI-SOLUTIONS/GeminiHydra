/**
 * Interactive Help Browser - Terminal-based interactive help
 *
 * @module help/interactive
 */

import chalk from 'chalk';
import readline from 'readline';
import { commandRegistry } from '../CommandRegistry.js';
import { categoryConfig, getCategoryDisplay } from './HelpMetaRegistry.js';
import { generateCategoryHelp, generateCommandHelp, searchHelp } from './generators.js';

/**
 * Run interactive help browser
 */
export async function runInteractiveHelp(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const categories = commandRegistry.getCategories()
    .map(c => getCategoryDisplay(c))
    .sort((a, b) => a.order - b.order);

  let running = true;

  const showMenu = () => {
    console.clear();
    console.log(chalk.bold.cyan('\n\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557'));
    console.log(chalk.bold.cyan('\u2551') + chalk.bold.white('         Interactive Help Browser                          ') + chalk.bold.cyan('\u2551'));
    console.log(chalk.bold.cyan('\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D\n'));

    console.log(chalk.bold.white('Navigation:'));
    console.log(chalk.gray('  [number] - Select category'));
    console.log(chalk.gray('  [name]   - View command help'));
    console.log(chalk.gray('  s <text> - Search'));
    console.log(chalk.gray('  q        - Quit\n'));

    console.log(chalk.bold.white('Categories:\n'));

    categories.forEach((cat, i) => {
      const cmdCount = commandRegistry.getByCategory(cat.name).length;
      if (cmdCount > 0) {
        console.log(`  ${chalk.cyan((i + 1).toString().padStart(2))}. ${cat.icon} ${cat.displayName} ${chalk.gray(`(${cmdCount})`)}`);
      }
    });

    console.log('');
  };

  const showCategory = (cat: { name: string }) => {
    console.clear();
    console.log(generateCategoryHelp(cat.name));
    console.log(chalk.gray('\nPress Enter to go back, or type a command name for details...'));
  };

  const prompt = (): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(chalk.cyan('\n> '), (answer) => {
        resolve(answer.trim());
      });
    });
  };

  showMenu();

  while (running) {
    const input = await prompt();

    if (input === 'q' || input === 'quit' || input === 'exit') {
      running = false;
      break;
    }

    if (input === '' || input === 'menu' || input === 'm') {
      showMenu();
      continue;
    }

    if (input.startsWith('s ') || input.startsWith('search ')) {
      const query = input.replace(/^(s|search)\s+/, '');
      console.clear();
      console.log(searchHelp(query));
      continue;
    }

    const num = parseInt(input);
    if (!isNaN(num) && num >= 1 && num <= categories.length) {
      const cat = categories[num - 1];
      showCategory(cat);
      continue;
    }

    const cmdName = input.replace(/^\//, '');
    if (commandRegistry.has(cmdName)) {
      console.clear();
      console.log(generateCommandHelp(cmdName));
      continue;
    }

    const matchedCat = categories.find(c =>
      c.name.toLowerCase() === input.toLowerCase() ||
      c.displayName.toLowerCase() === input.toLowerCase()
    );

    if (matchedCat) {
      showCategory(matchedCat);
      continue;
    }

    console.clear();
    console.log(searchHelp(input));
  }

  rl.close();
  console.log(chalk.gray('\nExited help browser.\n'));
}
