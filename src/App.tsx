import { useMemo, useState } from 'react';
import {
  calculate,
  formatRational,
  validateFields,
  type CalculationResult,
  type FieldName,
  type RawFields,
} from './lib/calculator';
import './App.css';

const EMPTY_FIELDS: RawFields = {
  cylinderConstant: '',
  currentPressure: '',
  reservePressure: '',
  flowRate: '',
  minimumMinutes: '',
};

const STORAGE_KEY = 'oxygen-cylinder-checker.fields';

/** 从浏览器本地存储恢复上次的表单内容（数据损坏或存储不可用时回退为空白）。 */
function loadPersistedFields(): RawFields {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_FIELDS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return EMPTY_FIELDS;
    const record = parsed as Record<string, unknown>;
    const fields = { ...EMPTY_FIELDS };
    for (const key of Object.keys(fields) as FieldName[]) {
      const value = record[key];
      if (typeof value === 'string') fields[key] = value;
    }
    return fields;
  } catch {
    return EMPTY_FIELDS;
  }
}

/** 把表单内容保存到浏览器本地存储，页面异常关闭或刷新后不丢失。 */
function persistFields(fields: RawFields) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fields));
  } catch {
    // 存储不可用（如隐私模式）时静默忽略，不影响判定功能
  }
}

const FIELD_META: Array<{
  name: FieldName;
  label: string;
  unit: string;
  placeholder: string;
}> = [
  { name: 'cylinderConstant', label: '瓶常数', unit: '升/巴', placeholder: '例如 10' },
  { name: 'currentPressure', label: '当前压力', unit: '巴', placeholder: '例如 150' },
  { name: 'reservePressure', label: '保留压力', unit: '巴', placeholder: '例如 50' },
  { name: 'flowRate', label: '流量', unit: '升/分钟', placeholder: '例如 5' },
  { name: 'minimumMinutes', label: '最低保障分钟数', unit: '分钟', placeholder: '例如 30 或 29.5' },
];

export default function App() {
  const [fields, setFields] = useState<RawFields>(loadPersistedFields);
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [result, setResult] = useState<CalculationResult | null>(null);
  /** 合法结果生成后，任何字段被修改都会置为 true，直到重新计算。 */
  const [stale, setStale] = useState(false);

  const validation = useMemo(() => validateFields(fields), [fields]);

  function handleChange(name: FieldName, value: string) {
    setFields((prev) => {
      const next = { ...prev, [name]: value };
      persistFields(next);
      return next;
    });
    // 任何修改都立即使旧结论进入“待重新计算”状态。
    // 输入非法时结论被隐藏且计算被阻止，但“已计算过、待重算”的状态保留，
    // 修正错误后仍明确提示待重新计算，而不是表现得像从未计算过。
    setStale(true);
  }

  function handleBlur(name: FieldName) {
    setTouched((prev) => ({ ...prev, [name]: true }));
  }

  function handleCalculate() {
    if (!validation.valid || !validation.values) return;
    setResult(calculate(validation.values));
    setStale(false);
  }

  // 页面只能呈现与当前参数对应的结论：结果存在、未过期且当前输入全部合法。
  const showVerdict = result !== null && !stale && validation.valid;
  const showPending = validation.valid && (result === null || stale);

  return (
    <main className="container">
      <h1>氧气瓶转运放行判定器</h1>
      <p className="formula">
        可用分钟数 = 瓶常数 ×（当前压力 − 保留压力）÷ 流量，向下取整；
        可用分钟数 ≥ 最低保障分钟数时放行。
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleCalculate();
        }}
        noValidate
      >
        {FIELD_META.map(({ name, label, unit, placeholder }) => {
          const error = validation.errors[name];
          const showError = touched[name] && error;
          return (
            <div className="field" key={name}>
              <label htmlFor={`field-${name}`}>
                {label}（{unit}）
              </label>
              <input
                id={`field-${name}`}
                data-testid={`field-${name}`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder={placeholder}
                value={fields[name]}
                aria-invalid={showError ? true : undefined}
                aria-describedby={showError ? `error-${name}` : undefined}
                onChange={(event) => handleChange(name, event.target.value)}
                onBlur={() => handleBlur(name)}
              />
              {showError && (
                <span className="error" id={`error-${name}`} data-testid={`error-${name}`}>
                  {error}
                </span>
              )}
            </div>
          );
        })}

        <button
          type="submit"
          data-testid="calculate-button"
          disabled={!validation.valid}
        >
          计算并判定
        </button>
      </form>

      <section aria-live="polite" className="result-area">
        {showPending && (
          <p className="pending" data-testid="pending-hint">
            {result === null ? '请输入参数并计算。' : '参数已修改，待重新计算。'}
          </p>
        )}

        {showVerdict && result && (
          <div
            className={`verdict ${result.released ? 'released' : 'rejected'}`}
            data-testid="verdict"
          >
            <p className="verdict-status" data-testid="verdict-status">
              {result.released ? '放行' : '不放行'}
            </p>
            <p data-testid="verdict-detail">
              可用 {result.availableMinutes.toString()} 分钟，最低保障{' '}
              {formatRational(result.minimumMinutes)} 分钟，
              {result.released
                ? `余量 ${result.marginMinutes.toString()} 分钟。`
                : `短缺 ${(-result.marginMinutes).toString()} 分钟。`}
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
