import { describe, it, expect } from 'vitest';
import {
  EA_GLOB_CONST,
  EA_GLOB_REG,
  EA_GLOB_RP,
  EA_GLOB_FVAR,
  EA_GLOB_GLOB,
  EA_FVAR_CONST,
  EA_FVAR_REG,
  EA_FVAR_RP,
  EA_FVAR_FVAR,
  EA_FVAR_GLOB,
  EAW_GLOB_CONST,
  EAW_GLOB_REG,
  EAW_GLOB_RP,
  EAW_GLOB_FVAR,
  EAW_GLOB_GLOB,
  EAW_FVAR_CONST,
  EAW_FVAR_REG,
  EAW_FVAR_RP,
  EAW_FVAR_FVAR,
  EAW_FVAR_GLOB,
  TEMPLATE_L_ABC,
  TEMPLATE_L_HL,
  TEMPLATE_L_DE,
  TEMPLATE_S_ANY,
  TEMPLATE_S_HL,
  TEMPLATE_LW_HL,
  TEMPLATE_LW_DE,
  TEMPLATE_LW_BC,
  TEMPLATE_SW_DEBC,
  TEMPLATE_SW_HL,
  LOAD_BASE_GLOB,
  LOAD_IDX_CONST,
  CALC_EA,
  renderStepPipeline,
  type StepPipeline,
} from '../src/lowering/steps';

const asm = renderStepPipeline;

const assertSingleInstr = (name: string, pipeline: StepPipeline) => {
  expect(pipeline.length, `${name} should not be empty`).toBeGreaterThan(0);
  for (const text of renderStepPipeline(pipeline)) {
    expect(text.includes('\n'), `${name} contains newline in ${text}`).toBe(false);
    expect(text.includes(';'), `${name} contains multi-op/comment in ${text}`).toBe(false);
  }
};

describe('PR407 addressing-model coverage: step pipelines stay single-instruction', () => {
  it('EA and EAW builders emit single-op steps', () => {
    const builders: [string, StepPipeline][] = [
      ['EA_GLOB_CONST', EA_GLOB_CONST('glob_b', 1)],
      ['EA_GLOB_REG', EA_GLOB_REG('glob_b', 'c')],
      ['EA_GLOB_RP', EA_GLOB_RP('glob_b', 'DE')],
      ['EA_GLOB_FVAR', EA_GLOB_FVAR('glob_b', -4)],
      ['EA_GLOB_GLOB', EA_GLOB_GLOB('glob_b', 'glob_i')],
      ['EA_FVAR_CONST (folds)', EA_FVAR_CONST(-4, 2)],
      ['EA_FVAR_REG', EA_FVAR_REG(-4, 'c')],
      ['EA_FVAR_RP', EA_FVAR_RP(-4, 'DE')],
      ['EA_FVAR_FVAR', EA_FVAR_FVAR(-4, -6)],
      ['EA_FVAR_GLOB', EA_FVAR_GLOB(-4, 'glob_i')],
      ['EAW_GLOB_CONST', EAW_GLOB_CONST('glob_w', 1)],
      ['EAW_GLOB_REG', EAW_GLOB_REG('glob_w', 'c')],
      ['EAW_GLOB_RP', EAW_GLOB_RP('glob_w', 'DE')],
      ['EAW_GLOB_FVAR', EAW_GLOB_FVAR('glob_w', -4)],
      ['EAW_GLOB_GLOB', EAW_GLOB_GLOB('glob_w', 'glob_i')],
      ['EAW_FVAR_CONST (folds)', EAW_FVAR_CONST(-6, 1)],
      ['EAW_FVAR_REG', EAW_FVAR_REG(-4, 'c')],
      ['EAW_FVAR_RP', EAW_FVAR_RP(-4, 'DE')],
      ['EAW_FVAR_FVAR', EAW_FVAR_FVAR(-4, -6)],
      ['EAW_FVAR_GLOB', EAW_FVAR_GLOB(-4, 'glob_i')],
    ];

    for (const [name, pipeline] of builders) {
      assertSingleInstr(name, pipeline);
    }
  });

  it('templates keep one-instruction steps around EA', () => {
    const sampleEA = [...LOAD_BASE_GLOB('glob_b'), ...LOAD_IDX_CONST(0), ...CALC_EA()];
    const templates: [string, StepPipeline][] = [
      ['TEMPLATE_L_ABC', TEMPLATE_L_ABC('a', sampleEA)],
      ['TEMPLATE_L_HL', TEMPLATE_L_HL('H', sampleEA)],
      ['TEMPLATE_L_DE', TEMPLATE_L_DE('D', sampleEA)],
      ['TEMPLATE_S_ANY', TEMPLATE_S_ANY('a', sampleEA)],
      ['TEMPLATE_S_HL', TEMPLATE_S_HL('H', sampleEA)],
      ['TEMPLATE_LW_HL', TEMPLATE_LW_HL(sampleEA)],
      ['TEMPLATE_LW_DE', TEMPLATE_LW_DE(sampleEA)],
      ['TEMPLATE_LW_BC', TEMPLATE_LW_BC(sampleEA)],
      ['TEMPLATE_SW_DEBC(DE)', TEMPLATE_SW_DEBC('DE', sampleEA)],
      ['TEMPLATE_SW_DEBC(BC)', TEMPLATE_SW_DEBC('BC', sampleEA)],
      ['TEMPLATE_SW_HL', TEMPLATE_SW_HL(sampleEA)],
    ];

    for (const [name, pipeline] of templates) {
      assertSingleInstr(name, pipeline);
    }
  });

  it('folds FVAR + const for byte and word', () => {
    const ea = asm(EA_FVAR_CONST(-4, 2));
    expect(ea).toContain('ld e, (ix-$02)');
    expect(ea).toContain('ld d, (ix-$01)');
    expect(ea).toContain('ld hl, $0000');

    const eaw = asm(EAW_FVAR_CONST(-6, 1));
    expect(eaw).toContain('ld e, (ix-$04)');
    expect(eaw).toContain('ld d, (ix-$03)');
    expect(eaw).toContain('ld hl, $0000');
    expect(eaw).toContain('add hl, hl');
  });
});
