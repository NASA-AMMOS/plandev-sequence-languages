import { describe, expect, it } from 'vitest';
import { parseFPrimeJsonToAmpcsXml } from './fprime-dictionary.js';

describe('F-Prime Dictionary Converter', () => {
  it('should convert a simple F-Prime command to AMPCS XML', () => {
    const fprimeJson = JSON.stringify({
      commands: [
        {
          name: 'M.c1.SyncParams',
          commandKind: 'sync',
          opcode: 257,
          annotation: 'A sync command with parameters',
          formalParams: [
            {
              name: 'param1',
              annotation: 'Param 1',
              type: {
                name: 'U32',
                kind: 'integer',
                size: 32,
                signed: false,
              },
              ref: false,
            },
            {
              name: 'param2',
              annotation: 'Param 2',
              type: {
                name: 'string',
                kind: 'string',
                size: '80',
              },
              ref: false,
            },
          ],
        },
      ],
    });

    const xml = parseFPrimeJsonToAmpcsXml(fprimeJson, {
      missionName: 'test',
      version: '1.0.0',
      spacecraftId: 1,
    });

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<command_dictionary>');
    expect(xml).toContain('mission_name="test"');
    expect(xml).toContain('spacecraft_id="1"');
    expect(xml).toContain('opcode="0x0101"');
    expect(xml).toContain('stem="M.c1.SyncParams"');
    expect(xml).toContain('category name="module" value="M.c1"');
    expect(xml).toContain('unsigned_arg name="param1"');
    expect(xml).toContain('bit_length="32"');
    expect(xml).toContain('var_string_arg name="param2"');
    expect(xml).toContain('A sync command with parameters');
    expect(xml).toContain('Param 1');
    expect(xml).toContain('Param 2');
  });

  it('should handle various integer types', () => {
    const fprimeJson = JSON.stringify({
      commands: [
        {
          name: 'TEST.INT_CMD',
          commandKind: 'sync',
          opcode: 100,
          formalParams: [
            {
              name: 'signed8',
              type: { kind: 'integer', size: 8, signed: true },
              ref: false,
            },
            {
              name: 'unsigned16',
              type: { kind: 'integer', size: 16, signed: false },
              ref: false,
            },
            {
              name: 'signed64',
              type: { kind: 'integer', size: 64, signed: true },
              ref: false,
            },
          ],
        },
      ],
    });

    const xml = parseFPrimeJsonToAmpcsXml(fprimeJson);

    expect(xml).toContain('integer_arg name="signed8" bit_length="8"');
    expect(xml).toContain('min="-128" max="127"');
    expect(xml).toContain('unsigned_arg name="unsigned16" bit_length="16"');
    expect(xml).toContain('min="0" max="65535"');
    expect(xml).toContain('integer_arg name="signed64" bit_length="64"');
  });

  it('should handle float types', () => {
    const fprimeJson = JSON.stringify({
      commands: [
        {
          name: 'FLOAT_CMD',
          commandKind: 'sync',
          opcode: 200,
          formalParams: [
            {
              name: 'float32',
              annotation: 'A 32-bit float',
              type: { kind: 'float', size: 32 },
              ref: false,
            },
            {
              name: 'float64',
              type: { kind: 'float', size: 64 },
              ref: false,
            },
          ],
        },
      ],
    });

    const xml = parseFPrimeJsonToAmpcsXml(fprimeJson);

    expect(xml).toContain('float_arg name="float32" bit_length="32"');
    expect(xml).toContain('A 32-bit float');
    expect(xml).toContain('float_arg name="float64" bit_length="64"');
  });

  it('should handle boolean types', () => {
    const fprimeJson = JSON.stringify({
      commands: [
        {
          name: 'BOOL_CMD',
          commandKind: 'sync',
          opcode: 300,
          formalParams: [
            {
              name: 'enable',
              type: { kind: 'boolean' },
              ref: false,
            },
          ],
        },
      ],
    });

    const xml = parseFPrimeJsonToAmpcsXml(fprimeJson);

    expect(xml).toContain('boolean_arg name="enable"');
    expect(xml).toContain('true_str="TRUE" false_str="FALSE"');
  });

  it('should handle enum types with enum definitions', () => {
    const fprimeJson = JSON.stringify({
      enums: [
        {
          name: 'STATUS_ENUM',
          constants: [
            { name: 'OFF', value: 0 },
            { name: 'ON', value: 1 },
            { name: 'STANDBY', value: 2 },
          ],
        },
      ],
      commands: [
        {
          name: 'ENUM_CMD',
          commandKind: 'sync',
          opcode: 400,
          formalParams: [
            {
              name: 'status',
              type: { kind: 'enum', name: 'STATUS_ENUM', size: 8 },
              ref: false,
            },
          ],
        },
      ],
    });

    const xml = parseFPrimeJsonToAmpcsXml(fprimeJson);

    expect(xml).toContain('<enum_definitions>');
    expect(xml).toContain('enum_table name="STATUS_ENUM"');
    expect(xml).toContain('symbol="OFF" numeric="0"');
    expect(xml).toContain('symbol="ON" numeric="1"');
    expect(xml).toContain('symbol="STANDBY" numeric="2"');
    expect(xml).toContain('enum_arg name="status"');
    expect(xml).toContain('enum_name="STATUS_ENUM"');
  });

  it('should handle string types', () => {
    const fprimeJson = JSON.stringify({
      commands: [
        {
          name: 'STRING_CMD',
          commandKind: 'sync',
          opcode: 500,
          formalParams: [
            {
              name: 'message',
              annotation: 'A string message',
              type: { kind: 'string', size: '128' },
              ref: false,
            },
          ],
        },
      ],
    });

    const xml = parseFPrimeJsonToAmpcsXml(fprimeJson);

    expect(xml).toContain('var_string_arg name="message"');
    expect(xml).toContain('max_bit_length="1024"'); // 128 bytes * 8
    expect(xml).toContain('prefix_bit_length="16"');
    expect(xml).toContain('A string message');
  });

  it('should escape XML special characters', () => {
    const fprimeJson = JSON.stringify({
      commands: [
        {
          name: 'TEST.CMD<>&"\'',
          commandKind: 'sync',
          opcode: 1,
          annotation: 'Test <xml> & "quotes" \' chars',
        },
      ],
    });

    const xml = parseFPrimeJsonToAmpcsXml(fprimeJson);

    expect(xml).toContain('&lt;');
    expect(xml).toContain('&gt;');
    expect(xml).toContain('&amp;');
    expect(xml).toContain('&quot;');
    expect(xml).toContain('&apos;');
  });

  it('should handle commands without module extraction', () => {
    const fprimeJson = JSON.stringify({
      commands: [
        {
          name: 'M.c1.CMD_NAME',
          commandKind: 'sync',
          opcode: 1,
        },
      ],
    });

    const xml = parseFPrimeJsonToAmpcsXml(fprimeJson, {
      extractModuleFromName: false,
    });

    expect(xml).toContain('stem="M.c1.CMD_NAME"');
    expect(xml).not.toContain('<categories>');
  });

  it('should use custom default units', () => {
    const fprimeJson = JSON.stringify({
      commands: [
        {
          name: 'CMD',
          commandKind: 'sync',
          opcode: 1,
          formalParams: [
            {
              name: 'value',
              type: { kind: 'integer', size: 32, signed: false },
              ref: false,
            },
          ],
        },
      ],
    });

    const xml = parseFPrimeJsonToAmpcsXml(fprimeJson, {
      defaultUnits: 'meters',
    });

    expect(xml).toContain('units="meters"');
  });

  it('should format opcodes as hex with proper padding', () => {
    const fprimeJson = JSON.stringify({
      commands: [
        { name: 'CMD1', commandKind: 'sync', opcode: 1 },
        { name: 'CMD2', commandKind: 'sync', opcode: 255 },
        { name: 'CMD3', commandKind: 'sync', opcode: 4096 },
        { name: 'CMD4', commandKind: 'sync', opcode: 65535 },
      ],
    });

    const xml = parseFPrimeJsonToAmpcsXml(fprimeJson);

    expect(xml).toContain('opcode="0x0001"');
    expect(xml).toContain('opcode="0x00FF"');
    expect(xml).toContain('opcode="0x1000"');
    expect(xml).toContain('opcode="0xFFFF"');
  });
});
