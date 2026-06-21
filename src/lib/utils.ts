import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 格式化金额为 ¥XX,XXX.XX 格式（带千分位和货币符号）
 */
export function formatAmount(amount: number): string {
  return `¥${amount.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * 格式化金额为 XX.XX 格式（不带货币符号和千分位，用于紧凑输入展示）
 */
export function formatMoney(value: number): string {
  return value.toFixed(2);
}

/**
 * 格式化数字（千分位）
 */
export function formatNumber(num: number): string {
  return num.toLocaleString('zh-CN');
}
