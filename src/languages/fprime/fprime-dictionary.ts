/**
 * F-Prime Command Dictionary Parser and AMPCS XML Converter
 *
 * Parses F-Prime JSON command dictionaries (FPP JSON format) and converts them
 * to AMPCS XML command dictionary format.
 *
 * References:
 * - F-Prime JSON format: https://github.com/nasa/fprime/blob/main/docs/reference/fpp-json-dict.md
 * - AMPCS XML schema: https://github.com/NASA-AMMOS/ampcs-dict-schemas/blob/main/CommandDictionary.rnc
 */

/**
 * F-Prime JSON type definitions
 */
interface FPrimeType {
  name: string;
  kind: 'integer' | 'float' | 'string' | 'boolean' | 'enum' | 'array';
  size?: number | string;
  signed?: boolean;
  values?: Array<{ name: string; value: number }>;
}

interface FPrimeFormalParam {
  name: string;
  type: FPrimeType;
  ref: boolean;
  annotation?: string;
}

interface FPrimeCommand {
  name: string;
  commandKind: 'async' | 'guarded' | 'sync' | 'set' | 'save';
  opcode: number;
  formalParams?: FPrimeFormalParam[];
  annotation?: string;
  priority?: number;
  queueFullBehavior?: string;
}

interface FPrimeCommandDictionary {
  commands?: FPrimeCommand[];
  enums?: Array<{
    name: string;
    type?: FPrimeType;
    constants?: Array<{ name: string; value: number; annotation?: string }>;
  }>;
}

/**
 * Conversion options for F-Prime to AMPCS XML
 */
export interface FPrimeToAmpcsOptions {
  missionName?: string;
  version?: string;
  schemaVersion?: string;
  spacecraftId?: number;
  defaultCommandClass?: string;
  defaultUnits?: string;
  extractModuleFromName?: boolean;
}

/**
 * Parses an F-Prime JSON command dictionary and converts it to AMPCS XML format.
 *
 * @param jsonString - The F-Prime JSON dictionary as a string
 * @param options - Conversion options
 * @returns AMPCS XML command dictionary as a string
 */
export function parseFPrimeJsonToAmpcsXml(jsonString: string, options: FPrimeToAmpcsOptions = {}): string {
  const {
    missionName = 'fprime',
    version = '1.0.0',
    schemaVersion = '5.4',
    spacecraftId = 0,
    defaultCommandClass = 'FSW',
    defaultUnits = 'none',
    extractModuleFromName = true,
  } = options;

  const fprimeDict: FPrimeCommandDictionary = JSON.parse(jsonString);

  // Start building XML
  const xml: string[] = [];
  xml.push('<?xml version="1.0" encoding="UTF-8"?>');
  xml.push('<command_dictionary>');

  // Header
  xml.push(
    `    <header mission_name="${escapeXml(missionName)}" version="${escapeXml(version)}" ` +
      `schema_version="${escapeXml(schemaVersion)}" spacecraft_id="${spacecraftId}"></header>`,
  );

  // Enum definitions
  if (fprimeDict.enums && fprimeDict.enums.length > 0) {
    xml.push('    <enum_definitions>');
    for (const enumDef of fprimeDict.enums) {
      xml.push(`        <enum_table name="${escapeXml(enumDef.name)}">`);
      xml.push('            <values>');
      if (enumDef.constants) {
        for (const constant of enumDef.constants) {
          xml.push(`                <enum symbol="${escapeXml(constant.name)}" numeric="${constant.value}"></enum>`);
        }
      }
      xml.push('            </values>');
      xml.push('        </enum_table>');
    }
    xml.push('    </enum_definitions>');
  }

  // Command definitions
  xml.push('    <command_definitions>');

  if (fprimeDict.commands) {
    for (const command of fprimeDict.commands) {
      const commandXml = convertCommandToXml(command, {
        defaultCommandClass,
        defaultUnits,
        extractModuleFromName,
      });
      xml.push(commandXml);
    }
  }

  xml.push('    </command_definitions>');
  xml.push('</command_dictionary>');

  return xml.join('\n');
}

/**
 * Converts a single F-Prime command to AMPCS XML format.
 */
function convertCommandToXml(
  command: FPrimeCommand,
  options: {
    defaultCommandClass: string;
    defaultUnits: string;
    extractModuleFromName: boolean;
  },
): string {
  const xml: string[] = [];
  const opcode = `0x${command.opcode.toString(16).toUpperCase().padStart(4, '0')}`;

  // Extract module, stem is fully namespaced
  const stem = command.name;
  let moduleName = '';

  if (options.extractModuleFromName && command.name.includes('.')) {
    const parts = command.name.split('.');
    moduleName = parts.slice(0, -1).join('.');
  }

  // Determine if this is FSW or hardware command
  // F-Prime commands with parameters are FSW commands
  const hasFormalParams = command.formalParams && command.formalParams.length > 0;

  // FSW command
  // Unclear what FPrime defines as hardware command
  xml.push(
    `        <fsw_command opcode="${opcode}" stem="${escapeXml(stem)}" class="${escapeXml(options.defaultCommandClass)}">`,
  );

  // Arguments
  if (command.formalParams && command.formalParams.length > 0) {
    xml.push('            <arguments>');
    for (const param of command.formalParams) {
      const argXml = convertArgumentToXml(param, options.defaultUnits);
      xml.push(argXml);
    }
    xml.push('            </arguments>');
  }

  // Categories
  if (moduleName) {
    xml.push('            <categories>');
    xml.push(`                <category name="module" value="${escapeXml(moduleName)}"></category>`);
    xml.push('            </categories>');
  }

  // Description
  if (command.annotation) {
    xml.push(`            <description>${escapeXml(command.annotation)}</description>`);
  }

  xml.push(`        </fsw_command>`);

  return xml.join('\n');
}

/**
 * Converts an F-Prime formal parameter to AMPCS XML argument definition.
 */
function convertArgumentToXml(param: FPrimeFormalParam, defaultUnits: string): string {
  const xml: string[] = [];
  const argName = escapeXml(param.name);
  const type = param.type;

  switch (type.kind) {
    case 'integer': {
      const bitLength = type.size || 32;
      const isSigned = type.signed !== false; // Default to signed

      if (isSigned) {
        // Signed integer
        const { min, max } = getIntegerRange(Number(bitLength), true);
        xml.push(
          `                <integer_arg name="${argName}" bit_length="${bitLength}" units="${escapeXml(defaultUnits)}" default_value="0">`,
        );
        xml.push('                    <range_of_values>');
        xml.push(`                        <include min="${min}" max="${max}"></include>`);
        xml.push('                    </range_of_values>');
      } else {
        // Unsigned integer
        const { min, max } = getIntegerRange(Number(bitLength), false);
        xml.push(
          `                <unsigned_arg name="${argName}" bit_length="${bitLength}" units="${escapeXml(defaultUnits)}" default_value="0">`,
        );
        xml.push('                    <range_of_values>');
        xml.push(`                        <include min="${min}" max="${max}"></include>`);
        xml.push('                    </range_of_values>');
      }

      if (param.annotation) {
        xml.push(`                    <description>${escapeXml(param.annotation)}</description>`);
      }
      xml.push(`                </${isSigned ? 'integer_arg' : 'unsigned_arg'}>`);
      break;
    }

    case 'float': {
      const bitLength = type.size || 32;
      xml.push(
        `                <float_arg name="${argName}" bit_length="${bitLength}" units="${escapeXml(defaultUnits)}" default_value="0.0">`,
      );
      if (param.annotation) {
        xml.push(`                    <description>${escapeXml(param.annotation)}</description>`);
      }
      xml.push('                </float_arg>');
      break;
    }

    case 'string': {
      const bitLength = type.size ? Number(type.size) * 8 : 256; // Convert bytes to bits
      // F-Prime strings are typically variable length with a prefix
      xml.push(
        `                <var_string_arg name="${argName}" prefix_bit_length="16" max_bit_length="${bitLength}" default_value="">`,
      );
      if (param.annotation) {
        xml.push(`                    <description>${escapeXml(param.annotation)}</description>`);
      }
      xml.push('                </var_string_arg>');
      break;
    }

    case 'boolean': {
      const bitLength = 8; // Standard boolean size
      xml.push(`                <boolean_arg name="${argName}" bit_length="${bitLength}">`);
      xml.push('                    <boolean_format true_str="TRUE" false_str="FALSE"></boolean_format>');
      if (param.annotation) {
        xml.push(`                    <description>${escapeXml(param.annotation)}</description>`);
      }
      xml.push('                </boolean_arg>');
      break;
    }

    case 'enum': {
      const bitLength = type.size || 32;
      const enumName = type.name || 'UNKNOWN_ENUM';
      xml.push(
        `                <enum_arg name="${argName}" bit_length="${bitLength}" enum_name="${escapeXml(enumName)}">`,
      );
      if (param.annotation) {
        xml.push(`                    <description>${escapeXml(param.annotation)}</description>`);
      }
      xml.push('                </enum_arg>');
      break;
    }

    case 'array': {
      // F-Prime arrays can be represented as repeat arguments
      // This is a simplified conversion - may need adjustment based on actual F-Prime array semantics
      xml.push(`                <repeat_arg name="${argName}" prefix_bit_length="8">`);
      xml.push('                    <repeat min="0" max="255">');
      xml.push('                        <arguments>');
      // Array element type would need to be parsed from type.size or additional type info
      xml.push('                            <unsigned_arg name="element" bit_length="8" units="none"></unsigned_arg>');
      xml.push('                        </arguments>');
      xml.push('                    </repeat>');
      if (param.annotation) {
        xml.push(`                    <description>${escapeXml(param.annotation)}</description>`);
      }
      xml.push('                </repeat_arg>');
      break;
    }

    default:
      // Fallback to unsigned integer
      xml.push(`                <unsigned_arg name="${argName}" bit_length="32" units="${escapeXml(defaultUnits)}">`);
      if (param.annotation) {
        xml.push(`                    <description>${escapeXml(param.annotation)}</description>`);
      }
      xml.push('                </unsigned_arg>');
  }

  return xml.join('\n');
}

/**
 * Calculates the min/max range for an integer type based on bit length and signedness.
 */
function getIntegerRange(bitLength: number, signed: boolean): { min: string; max: string } {
  if (signed) {
    const max = Math.pow(2, bitLength - 1) - 1;
    const min = -Math.pow(2, bitLength - 1);
    return { min: min.toString(), max: max.toString() };
  } else {
    const max = Math.pow(2, bitLength) - 1;
    return { min: '0', max: max.toString() };
  }
}

/**
 * Escapes XML special characters.
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
