import React from 'react';
import { Search, X, Inbox } from 'lucide-react';

/**
 * 全站共享 UI 组件（统一样式的单一来源）
 * 主题：浅色白底 + Emerald 主操作色
 *
 * 设计规范：
 * - 页面底色：bg-slate-50；卡片容器：bg-white rounded-xl border border-slate-200
 * - 主按钮：bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg
 * - 次按钮：bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg
 * - 输入框：bg-white border-slate-300 rounded-md focus:border-emerald-500
 * - 表格表头：bg-slate-50 text-slate-500 font-medium
 * - 字号仅两级：标题 text-base(16px) / 正文 text-[13px]
 * - 按钮仅两档尺寸：标准 px-4 py-2 / 紧凑 px-3 py-1.5
 */

// ============ 卡片 ============

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  /** 无内边距（内容区自行控制，如表格） */
  noPadding?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, noPadding = false, className = '', ...rest }) => (
  <div
    className={`bg-white rounded-xl border border-slate-200 ${noPadding ? '' : 'p-6'} ${className}`}
    {...rest}
  >
    {children}
  </div>
);

// ============ 页面/卡片标题 ============

interface PageHeaderProps {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  /** 右侧操作区 */
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ icon, title, subtitle, actions }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
    <div className="flex items-center gap-3">
      {icon && (
        <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 flex-shrink-0">
          {icon}
        </div>
      )}
      <div>
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        {subtitle && <p className="text-[13px] text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
    {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
  </div>
);

interface CardHeaderProps {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export const CardHeader: React.FC<CardHeaderProps> = ({ icon, title, subtitle, actions }) => (
  <div className="flex items-center justify-between mb-4">
    <div className="flex items-center gap-2.5">
      {icon && <span className="text-emerald-600 flex-shrink-0">{icon}</span>}
      <div>
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {subtitle && <p className="text-[13px] text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
    {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
  </div>
);

// ============ 按钮 ============

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: React.ReactNode;
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:bg-slate-300 disabled:cursor-not-allowed',
  secondary: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed',
  danger: 'bg-red-600 hover:bg-red-700 text-white shadow-sm disabled:bg-slate-300 disabled:cursor-not-allowed',
  ghost: 'text-slate-600 hover:text-slate-900 hover:bg-slate-100',
};

const baseButton = 'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium text-[13px] transition-colors disabled:cursor-not-allowed';

/** 标准尺寸按钮（工具栏/表单） */
export const Button: React.FC<ButtonProps> = ({ variant = 'primary', className = '', children, ...rest }) => (
  <button
    className={`${baseButton} px-4 py-2 ${buttonVariants[variant]} ${className}`}
    {...rest}
  >
    {children}
  </button>
);

/** 紧凑尺寸按钮（表格行内/密集工具栏） */
export const ButtonCompact: React.FC<ButtonProps> = ({ variant = 'primary', className = '', children, ...rest }) => (
  <button
    className={`${baseButton} px-3 py-1.5 ${buttonVariants[variant]} ${className}`}
    {...rest}
  >
    {children}
  </button>
);

// ============ 徽章 ============

type BadgeVariant = 'emerald' | 'cyan' | 'blue' | 'purple' | 'amber' | 'red' | 'slate';

const badgeVariants: Record<BadgeVariant, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cyan: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  purple: 'bg-purple-50 text-purple-700 border-purple-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
};

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ variant = 'slate', children, className = '' }) => (
  <span
    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[13px] font-medium border ${badgeVariants[variant]} ${className}`}
  >
    {children}
  </span>
);

// ============ 输入框 / 下拉框 ============

export const inputClassName =
  'bg-white border border-slate-300 rounded-md px-3 py-1.5 text-[13px] text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors';

export const selectClassName =
  'bg-white border border-slate-300 rounded-md px-3 py-1.5 text-[13px] text-slate-900 focus:outline-none focus:border-emerald-500 transition-colors appearance-none cursor-pointer';

// ============ 搜索框（带图标和清除按钮） ============

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** 宽度，如 w-72 */
  widthClassName?: string;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  placeholder = '搜索...',
  widthClassName = 'w-64',
}) => (
  <div className={`relative ${widthClassName}`}>
    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`${inputClassName} pl-9 pr-8 w-full`}
    />
    {value && (
      <button
        type="button"
        onClick={() => onChange('')}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        title="清除"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    )}
  </div>
);

// ============ 表格 ============

interface TableProps {
  children: React.ReactNode;
  className?: string;
}

export const Table: React.FC<TableProps> = ({ children, className = '' }) => (
  <div className="overflow-x-auto">
    <table className={`w-full ${className}`}>{children}</table>
  </div>
);

export const Th: React.FC<React.ThHTMLAttributes<HTMLTableCellElement>> = ({ className = '', children, ...rest }) => (
  <th
    className={`px-4 py-3 text-[13px] font-medium text-slate-500 text-left bg-slate-50 ${className}`}
    {...rest}
  >
    {children}
  </th>
);

export const Td: React.FC<React.TdHTMLAttributes<HTMLTableCellElement>> = ({ className = '', children, ...rest }) => (
  <td className={`px-4 py-3 text-[13px] text-slate-600 ${className}`} {...rest}>
    {children}
  </td>
);

/** 可排序列头 */
interface SortableThProps {
  label: string;
  field: string;
  activeField: string | null;
  direction: 'asc' | 'desc';
  onSort: (field: string) => void;
  className?: string;
}

export const SortableTh: React.FC<SortableThProps> = ({ label, field, activeField, direction, onSort, className = '' }) => {
  const active = activeField === field;
  return (
    <Th
      className={`cursor-pointer select-none hover:text-slate-900 ${active ? 'text-emerald-600' : ''} ${className}`}
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          direction === 'asc' ? (
            <ArrowUpIcon className="w-3 h-3" />
          ) : (
            <ArrowDownIcon className="w-3 h-3" />
          )
        ) : (
          <ArrowUpDownIcon className="w-3 h-3 opacity-40" />
        )}
      </span>
    </Th>
  );
};

// 排序图标（内联避免重复导入）
const ArrowUpIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const ArrowDownIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 5v14M19 12l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const ArrowUpDownIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M8 7h11M8 12h11M8 17h11M3 7l3 3M3 17l3-3" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

/** 表格行 */
export const Tr: React.FC<React.HTMLAttributes<HTMLTableRowElement>> = ({ className = '', children, ...rest }) => (
  <tr className={`border-t border-slate-100 hover:bg-slate-50 transition-colors ${className}`} {...rest}>
    {children}
  </tr>
);

// ============ 空状态 ============

interface EmptyStateProps {
  /** 显示文本，默认"暂无数据" */
  text?: string;
  /** 大间距（页面级空态），默认表格内小间距 */
  large?: boolean;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ text = '暂无数据', large = false, className = '' }) => (
  <div className={`flex flex-col items-center justify-center text-slate-400 ${large ? 'py-16' : 'py-8'} ${className}`}>
    {large && <Inbox className="w-12 h-12 text-slate-300 mb-3" />}
    <p className={`text-[13px] ${large ? 'text-base' : ''}`}>{text}</p>
  </div>
);

/** 表格内空态（colSpan 占整行） */
export const TableEmptyRow: React.FC<{ colSpan: number; text?: string }> = ({ colSpan, text = '暂无数据' }) => (
  <tr>
    <td colSpan={colSpan} className="px-4 py-8 text-center text-slate-400 text-[13px]">
      {text}
    </td>
  </tr>
);

// ============ 分段控制器（时间筛选/tab 切换） ============

interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** 小尺寸（表格上方内嵌） */
  small?: boolean;
}

export function SegmentedControl<T extends string>({ options, value, onChange, small = false }: SegmentedControlProps<T>) {
  return (
    <div className={`inline-flex gap-0.5 ${small ? 'p-0.5' : 'p-1'} rounded-lg bg-slate-100 border border-slate-200`}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`${small ? 'px-2.5 py-1' : 'px-3 py-1.5'} rounded-md text-[13px] transition-colors ${
            value === opt.value
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-900 hover:bg-white'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ============ 工具函数：统一利润率配色 ============

/**
 * 全站统一的利润率配色（四档）
 * >= 15% 优 / 5~15% 良 / 0~5% 警戒 / < 0 亏损
 */
export function profitRateColor(rate: number): string {
  if (rate >= 15) return 'text-emerald-600';
  if (rate >= 5) return 'text-cyan-600';
  if (rate >= 0) return 'text-amber-600';
  return 'text-red-600';
}

/**
 * 全站统一的利润率背景配色（含背景色，用于徽章）
 */
export function profitRateBadgeClass(rate: number): string {
  if (rate >= 15) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (rate >= 5) return 'bg-cyan-50 text-cyan-700 border-cyan-200';
  if (rate >= 0) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-red-50 text-red-700 border-red-200';
}
