
export type TransactionType = 'INCOME' | 'EXPENSE';

export interface Expense {
  id: string;
  amount: number;
  category: string;
  description: string;
  date: string; // ISO Date string YYYY-MM-DD
  timestamp: number; // For sorting
  type: TransactionType;
}

export interface CategorySummary {
  name: string;
  value: number;
  color: string;
}

export interface CategoryLimit {
  category: string;
  limit: number;
}

export interface Goal {
  id: string;
  title: string;
  targetAmount: number;
}

export enum View {
  DASHBOARD = 'DASHBOARD',
  ADD = 'ADD',
  HISTORY = 'HISTORY',
  INSIGHTS = 'INSIGHTS'
}

export enum Frequency {
  ONCE = 'ONCE',
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  YEARLY = 'YEARLY'
}

export interface RecurringExpense {
  id: string;
  amount: number;
  category: string;
  description: string;
  frequency: Frequency;
  nextDueDate: string; // ISO Date YYYY-MM-DD
  type: TransactionType;
}

export const EXPENSE_CATEGORIES = [
  'Shopping',
  'Food & Dining',
  'Friends',
  'Family',
  'Petrol/Transport',
  'EMI/Loans',
  'Membership',
  'Bills & Utilities',
  'Entertainment',
  'Health',
  'Travel',
  'Other'
];

export const INCOME_CATEGORIES = [
  'Salary',
  'Freelance',
  'Business',
  'Investments',
  'Gift',
  'Refund',
  'Other'
];

export const CHART_COLORS = [
  '#3b82f6', // blue-500
  '#ef4444', // red-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
  '#f97316', // orange-500
  '#6366f1', // indigo-500
  '#84cc16', // lime-500
  '#14b8a6', // teal-500
  '#64748b', // slate-500
];

export const CURRENCIES = [
  { code: 'USD', symbol: '$', label: 'USD' },
  { code: 'EUR', symbol: '€', label: 'EUR' },
  { code: 'GBP', symbol: '£', label: 'GBP' },
  { code: 'INR', symbol: '₹', label: 'INR' },
  { code: 'JPY', symbol: '¥', label: 'JPY' },
  { code: 'CAD', symbol: 'C$', label: 'CAD' },
  { code: 'AUD', symbol: 'A$', label: 'AUD' },
  { code: 'CNY', symbol: '¥', label: 'CNY' },
];