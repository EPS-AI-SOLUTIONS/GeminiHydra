import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true, strict: false });

export const buildToolValidators = (tools) => {
  const validators = new Map();
  for (const tool of tools) {
    if (!tool.inputSchema) continue;
    const validate = ajv.compile(tool.inputSchema);
    validators.set(tool.name, validate);
  }
  return validators;
};
