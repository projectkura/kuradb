export interface GenerateCommandOptions {
  customName?: string;
  typesOnly: boolean;
}

export function parseGenerateCommandArgs(args: string[]): GenerateCommandOptions {
  const positionalArgs: string[] = [];
  let typesOnly = false;

  for (const arg of args) {
    if (arg === '--types-only') {
      typesOnly = true;
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    positionalArgs.push(arg);
  }

  if (typesOnly && positionalArgs.length > 0) {
    throw new Error('The --types-only flag cannot be combined with a migration name.');
  }

  if (positionalArgs.length > 1) {
    throw new Error('Only one migration name can be provided.');
  }

  return {
    customName: positionalArgs[0],
    typesOnly,
  };
}
