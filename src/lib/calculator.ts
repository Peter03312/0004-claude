/**
 * 氧气瓶转运放行判定 —— 纯前端计算与校验逻辑。
 * 不依赖任何后端或在线服务。
 *
 * 所有数值以十进制有理数（BigInt 分子/分母）精确表示并运算：
 * - 不会把“还差 1 分钟”的余量因浮点误差误判为刚好够用；
 * - 超大有限数值（如 1e308）精确计算，不会溢出显示成 Infinity。
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
  /** 最低保障分钟数（分钟，允许小数） */
  minimumMinutes: string;
}

/** 精确十进制有理数：num / den，den > 0。 */
export interface Rational {
  readonly num: bigint;
  readonly den: bigint;
}

/** 校验通过后的数值（精确有理数）。 */
export interface ParsedValues {
  cylinderConstant: Rational;
  currentPressure: Rational;
  reservePressure: Rational;
  flowRate: Rational;
  minimumMinutes: Rational;
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
  /** 可用分钟数：瓶常数 ×（当前压力 − 保留压力）÷ 流量，精确向下取整。 */
  availableMinutes: bigint;
  /** 最低保障分钟数（精确值，回显用）。 */
  minimumMinutes: Rational;
  /** 整数余量（>= 0）或短缺（< 0 的相反数），单位分钟。 */
  marginMinutes: bigint;
  /** 可用分钟数 >= 最低保障分钟数时放行。 */
  released: boolean;
}

const ERR_NOT_FINITE_NON_NEGATIVE = '须为有限的非负数字';
const ERR_OUT_OF_RANGE = '数值超出可精确计算的范围';

const DECIMAL_PATTERN = /^([+-]?)(\d+(?:\.\d*)?|\.\d+)(?:[eE]([+-]?\d+))?$/;

/**
 * 可精确计算的十进制规模上限：科学计数法指数的绝对值与小数位数均不得超过它。
 * 10000 已远超任何物理意义（双精度上限约 1e308），
 * 但能防止 1e-999999999 之类极端输入构造出天文数字的 BigInt 使页面卡死。
 */
export const MAX_DECIMAL_SCALE = 10_000;

export type ParseDecimalResult =
  | { ok: true; value: Rational }
  | { ok: false; reason: 'invalid' | 'out-of-range' };

/**
 * 把输入框字符串解析为精确十进制有理数（带失败原因）。
 * - invalid：空串、非数字、±Infinity、NaN、超出双精度有限范围（如 1e999）；
 * - out-of-range：指数或小数位数超过 MAX_DECIMAL_SCALE（如 1e-999999999）。
 */
export function parseDecimalDetailed(raw: string): ParseDecimalResult {
  const trimmed = raw.trim();
  const match = DECIMAL_PATTERN.exec(trimmed);
  if (!match) return { ok: false, reason: 'invalid' };
  // “有限”按双精度语义把关：1e999 等字面量虽可表示为有理数，但按非有限拒绝。
  if (!Number.isFinite(Number(trimmed))) return { ok: false, reason: 'invalid' };

  const [, sign, mantissa, expPart] = match;
  const dotIndex = mantissa.indexOf('.');
  const intPart = dotIndex === -1 ? mantissa : mantissa.slice(0, dotIndex);
  const fracPart = dotIndex === -1 ? '' : mantissa.slice(dotIndex + 1);
  const exp = expPart === undefined ? 0n : BigInt(expPart.replace(/^\+/, ''));

  if (
    fracPart.length > MAX_DECIMAL_SCALE ||
    exp > BigInt(MAX_DECIMAL_SCALE) ||
    exp < BigInt(-MAX_DECIMAL_SCALE)
  ) {
    return { ok: false, reason: 'out-of-range' };
  }

  let num = BigInt((intPart === '' ? '0' : intPart) + fracPart);
  let den = 10n ** BigInt(fracPart.length);
  if (exp >= 0n) {
    num *= 10n ** exp;
  } else {
    den *= 10n ** -exp;
  }
  if (sign === '-') num = -num;
  return { ok: true, value: { num, den } };
}

/**
 * 把输入框字符串解析为精确十进制有理数。
 * 非法或超出可计算范围时返回 null。
 */
export function parseDecimal(raw: string): Rational | null {
  const result = parseDecimalDetailed(raw);
  return result.ok ? result.value : null;
}

/** 解析并要求非负；返回有理数或对应的错误信息。 */
function parseNonNegative(raw: string): { value: Rational | null; error?: string } {
  const parsed = parseDecimalDetailed(raw);
  if (!parsed.ok) {
    return {
      value: null,
      error: parsed.reason === 'out-of-range' ? ERR_OUT_OF_RANGE : ERR_NOT_FINITE_NON_NEGATIVE,
    };
  }
  if (parsed.value.num < 0n) return { value: null, error: ERR_NOT_FINITE_NON_NEGATIVE };
  return { value: parsed.value };
}

/** 比较两个有理数：a < b 返回 -1，相等返回 0，a > b 返回 1。 */
function compareRationals(a: Rational, b: Rational): number {
  const lhs = a.num * b.den;
  const rhs = b.num * a.den;
  return lhs < rhs ? -1 : lhs > rhs ? 1 : 0;
}

/**
 * 校验全部字段：
 * - 所有值必须是有限的非负数字；
 * - 瓶常数与流量必须大于 0；
 * - 保留压力不得高于当前压力（精确比较）。
 */
export function validateFields(fields: RawFields): ValidationResult {
  const errors: FieldErrors = {};

  const cylinderConstant = parseNonNegative(fields.cylinderConstant);
  if (cylinderConstant.error !== undefined) {
    errors.cylinderConstant = cylinderConstant.error;
  } else if (cylinderConstant.value!.num === 0n) {
    errors.cylinderConstant = '瓶常数必须大于 0';
  }

  const currentPressure = parseNonNegative(fields.currentPressure);
  if (currentPressure.error !== undefined) {
    errors.currentPressure = currentPressure.error;
  }

  const reservePressure = parseNonNegative(fields.reservePressure);
  if (reservePressure.error !== undefined) {
    errors.reservePressure = reservePressure.error;
  }

  const flowRate = parseNonNegative(fields.flowRate);
  if (flowRate.error !== undefined) {
    errors.flowRate = flowRate.error;
  } else if (flowRate.value!.num === 0n) {
    errors.flowRate = '流量必须大于 0';
  }

  const minimumMinutes = parseNonNegative(fields.minimumMinutes);
  if (minimumMinutes.error !== undefined) {
    errors.minimumMinutes = minimumMinutes.error;
  }

  if (
    currentPressure.value !== null &&
    reservePressure.value !== null &&
    compareRationals(reservePressure.value, currentPressure.value) > 0
  ) {
    errors.reservePressure = '保留压力不得高于当前压力';
  }

  const valid = Object.keys(errors).length === 0;
  return {
    valid,
    errors,
    values: valid
      ? {
          cylinderConstant: cylinderConstant.value as Rational,
          currentPressure: currentPressure.value as Rational,
          reservePressure: reservePressure.value as Rational,
          flowRate: flowRate.value as Rational,
          minimumMinutes: minimumMinutes.value as Rational,
        }
      : undefined,
  };
}

/**
 * 可用分钟数 = 瓶常数 ×（当前压力 − 保留压力）÷ 流量。
 * 全程 BigInt 精确运算，非负有理数的截断除法即向下取整，无需任何 epsilon 修正。
 */
export function calculateAvailableMinutes(values: ParsedValues): bigint {
  const diffNum =
    values.currentPressure.num * values.reservePressure.den -
    values.reservePressure.num * values.currentPressure.den;
  const diffDen = values.currentPressure.den * values.reservePressure.den;
  // 校验已保证 当前压力 >= 保留压力，故 diffNum >= 0。
  const num = diffNum * values.cylinderConstant.num * values.flowRate.den;
  const den = diffDen * values.cylinderConstant.den * values.flowRate.num;
  return num / den;
}

/**
 * 由已校验的数值生成判定结果。
 * 余量/短缺始终显示为整数分钟，并按保守方向取整：
 * 放行时余量向下取整（不报高），不放行时短缺向上取整（不报低）。
 */
export function calculate(values: ParsedValues): CalculationResult {
  const availableMinutes = calculateAvailableMinutes(values);
  const minimum = values.minimumMinutes;
  // 比较 availableMinutes 与 minimum：available * den 与 num
  const diffNum = availableMinutes * minimum.den - minimum.num;
  const released = diffNum >= 0n;
  const marginMinutes = released
    ? diffNum / minimum.den // 余量：非负有理数向下取整
    : -((-diffNum + minimum.den - 1n) / minimum.den); // 短缺：正有理数向上取整后取负
  return { availableMinutes, minimumMinutes: minimum, marginMinutes, released };
}

/**
 * 把十进制有理数格式化为不带多余尾零的十进制字符串。
 * 输入来自十进制解析，分母必为 10 的幂，故可精确格式化。
 */
export function formatRational(value: Rational): string {
  const negative = value.num < 0n;
  const abs = negative ? -value.num : value.num;
  const fracDigits = value.den.toString().length - 1;
  if (fracDigits === 0) return (negative ? '-' : '') + abs.toString();
  const quotient = abs / value.den;
  const remainder = abs % value.den;
  const frac = remainder
    .toString()
    .padStart(fracDigits, '0')
    .replace(/0+$/, '');
  return (
    (negative ? '-' : '') + quotient.toString() + (frac === '' ? '' : `.${frac}`)
  );
}
