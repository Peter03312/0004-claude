/**
 * 氧气瓶转运放行判定 —— 纯前端计算与校验逻辑。
 * 不依赖任何后端或在线服务。
 */

/** 表单原始输入（全部为字符串，与输入框一一对应）。 */
export interface RawFields {
  /** 瓶常数（升/巴） */
  cylinderConstant: string;
  /** 当前压力（巴） */
  currentPressure: string;
  /** 保留压力（巴） */
  reservePressure: string;
  /** 流量（升/分钟） */
  flowRate: string;
  /** 最低保障分钟数（分钟） */
  minimumMinutes: string;
}

/** 校验通过后的数值。 */
export interface ParsedValues {
  cylinderConstant: number;
  currentPressure: number;
  reservePressure: number;
  flowRate: number;
  minimumMinutes: number;
}

export type FieldName = keyof RawFields;

export type FieldErrors = Partial<Record<FieldName, string>>;

export interface ValidationResult {
  valid: boolean;
  errors: FieldErrors;
  /** 仅当 valid 为 true 时存在。 */
  values?: ParsedValues;
}

export interface CalculationResult {
  /** 可用分钟数：瓶常数 ×（当前压力 − 保留压力）÷ 流量，向下取整。 */
  availableMinutes: number;
  /** 最低保障分钟数（回显用）。 */
  minimumMinutes: number;
  /** 整数余量（>= 0）或短缺（< 0），单位分钟。 */
  marginMinutes: number;
  /** 可用分钟数 >= 最低保障分钟数时放行。 */
  released: boolean;
}

const ERR_NOT_FINITE_NON_NEGATIVE = '须为有限的非负数字';

/**
 * 解析一个输入框字符串：去掉首尾空白后必须能解析为有限的非负数字。
 * 空串、非数字、负数、±Infinity、NaN 一律返回 null。
 */
function parseFiniteNonNegative(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

/**
 * 校验全部字段：
 * - 所有值必须是有限的非负数字；
 * - 瓶常数与流量必须大于 0；
 * - 最低保障分钟数须为非负整数（保证余量/短缺为整数分钟）；
 * - 保留压力不得高于当前压力。
 */
export function validateFields(fields: RawFields): ValidationResult {
  const errors: FieldErrors = {};

  const cylinderConstant = parseFiniteNonNegative(fields.cylinderConstant);
  if (cylinderConstant === null) {
    errors.cylinderConstant = ERR_NOT_FINITE_NON_NEGATIVE;
  } else if (cylinderConstant === 0) {
    errors.cylinderConstant = '瓶常数必须大于 0';
  }

  const currentPressure = parseFiniteNonNegative(fields.currentPressure);
  if (currentPressure === null) {
    errors.currentPressure = ERR_NOT_FINITE_NON_NEGATIVE;
  }

  const reservePressure = parseFiniteNonNegative(fields.reservePressure);
  if (reservePressure === null) {
    errors.reservePressure = ERR_NOT_FINITE_NON_NEGATIVE;
  }

  const flowRate = parseFiniteNonNegative(fields.flowRate);
  if (flowRate === null) {
    errors.flowRate = ERR_NOT_FINITE_NON_NEGATIVE;
  } else if (flowRate === 0) {
    errors.flowRate = '流量必须大于 0';
  }

  const minimumMinutes = parseFiniteNonNegative(fields.minimumMinutes);
  if (minimumMinutes === null) {
    errors.minimumMinutes = ERR_NOT_FINITE_NON_NEGATIVE;
  } else if (!Number.isInteger(minimumMinutes)) {
    errors.minimumMinutes = '最低保障分钟数须为整数';
  }

  if (
    currentPressure !== null &&
    reservePressure !== null &&
    reservePressure > currentPressure
  ) {
    errors.reservePressure = '保留压力不得高于当前压力';
  }

  const valid = Object.keys(errors).length === 0;
  return {
    valid,
    errors,
    values: valid
      ? {
          cylinderConstant: cylinderConstant as number,
          currentPressure: currentPressure as number,
          reservePressure: reservePressure as number,
          flowRate: flowRate as number,
          minimumMinutes: minimumMinutes as number,
        }
      : undefined,
  };
}

/**
 * 可用分钟数 = 瓶常数 ×（当前压力 − 保留压力）÷ 流量，向下取整到整数分钟。
 * 加 1e-9 抵消二进制浮点误差（例如理论值恰为整数时避免少算一分钟）。
 */
export function calculateAvailableMinutes(values: ParsedValues): number {
  const raw =
    (values.cylinderConstant * (values.currentPressure - values.reservePressure)) /
    values.flowRate;
  return Math.floor(raw + 1e-9);
}

/** 由已校验的数值生成判定结果。 */
export function calculate(values: ParsedValues): CalculationResult {
  const availableMinutes = calculateAvailableMinutes(values);
  const marginMinutes = availableMinutes - values.minimumMinutes;
  return {
    availableMinutes,
    minimumMinutes: values.minimumMinutes,
    marginMinutes,
    released: marginMinutes >= 0,
  };
}
