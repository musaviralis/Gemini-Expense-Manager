
import React, { useMemo, useState } from 'react';
import { Expense, RecurringExpense } from '../types';

interface ExpenseListProps {
  expenses: Expense[];
  recurringExpenses: RecurringExpense[];
  onDelete: (id: string) => void;
  onDeleteRecurring: (id: string) => void;
  currency: string;
}

type FilterType = 'ALL' | 'WEEK' | 'MONTH' | 'LAST_MONTH' | 'PICK_MONTH' | 'CUSTOM';
type SortType = 'DATE' | 'AMOUNT';

const getCategoryIcon = (category: string) => {
    if (category.includes('Shop')) return '🛍️';
    if (category.includes('Food')) return '🍔';
    if (category.includes('Trans') || category.includes('Petrol')) return '⛽';
    if (category.includes('Bill')) return '💡';
    if (category.includes('Entertain')) return '🎬';
    if (category.includes('Health')) return '💊';
    if (category.includes('Travel')) return '✈️';
    if (category.includes('Friend')) return '🤝';
    if (category.includes('Family')) return '👨‍👩‍👧';
    if (category.includes('Salary')) return '💰';
    if (category.includes('Free')) return '💻';
    return '📄';
};

const ExpenseList: React.FC<ExpenseListProps> = ({ expenses, recurringExpenses, onDelete, onDeleteRecurring, currency }) => {
  const [tab, setTab] = useState<'HISTORY' | 'RECURRING'>('HISTORY');
  
  // Filter State
  const [filterType, setFilterType] = useState<FilterType>('ALL');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM

  // Sort State
  const [sortType, setSortType] = useState<SortType>('DATE');

  const groupedExpenses = useMemo(() => {
    let filtered = expenses;
    const today = new Date();
    const getISO = (d: Date) => d.toISOString().split('T')[0];

    if (filterType === 'WEEK') {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        const threshold = getISO(d);
        filtered = expenses.filter(e => e.date >= threshold);
    } else if (filterType === 'MONTH') {
        const currentMonthPrefix = getISO(today).slice(0, 7); 
        filtered = expenses.filter(e => e.date.startsWith(currentMonthPrefix));
    } else if (filterType === 'LAST_MONTH') {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        const lastMonthPrefix = getISO(d).slice(0, 7);
        filtered = expenses.filter(e => e.date.startsWith(lastMonthPrefix));
    } else if (filterType === 'PICK_MONTH') {
        if (selectedMonth) {
            filtered = expenses.filter(e => e.date.startsWith(selectedMonth));
        }
    } else if (filterType === 'CUSTOM') {
        if (customStart) filtered = filtered.filter(e => e.date >= customStart);
        if (customEnd) filtered = filtered.filter(e => e.date <= customEnd);
    }

    if (sortType === 'AMOUNT') {
        const sorted = [...filtered].sort((a, b) => b.amount - a.amount);
        return { 'Top Transactions': sorted };
    }

    const groups: Record<string, Expense[]> = {};
    const sorted = [...filtered].sort((a, b) => b.timestamp - a.timestamp);
    
    sorted.forEach(exp => {
        if (!groups[exp.date]) {
            groups[exp.date] = [];
        }
        groups[exp.date].push(exp);
    });
    return groups;
  }, [expenses, filterType, customStart, customEnd, selectedMonth, sortType]);

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

  const handleExportCSV = () => {
    if (expenses.length === 0) {
        alert("No data to export.");
        return;
    }
    const headers = ['Date', 'Type', 'Category', 'Description', 'Amount', 'Currency'];
    const csvContent = [
        headers.join(','),
        ...expenses.map(e => [
            e.date,
            e.type || 'EXPENSE',
            e.category,
            `"${e.description.replace(/"/g, '""')}"`,
            e.amount,
            currency
        ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `expenses_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="pb-24 flex flex-col h-full">
        {/* Tab Switcher */}
        <div className="flex p-1 bg-slate-200 dark:bg-slate-800 rounded-xl mb-4 shrink-0 transition-colors">
            <button
                onClick={() => setTab('HISTORY')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${tab === 'HISTORY' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
            >
                Transactions
            </button>
            <button
                onClick={() => setTab('RECURRING')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${tab === 'RECURRING' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
            >
                Recurring Rules
            </button>
        </div>

        {/* Filters & Actions */}
        {tab === 'HISTORY' && (
            <div className="mb-4 shrink-0 animate-fade-in space-y-3">
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 items-center">
                    <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value as FilterType)}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20 font-medium"
                    >
                        <option value="ALL">All Time</option>
                        <option value="WEEK">Last 7 Days</option>
                        <option value="MONTH">This Month</option>
                        <option value="LAST_MONTH">Last Month</option>
                        <option value="PICK_MONTH">Specific Month</option>
                        <option value="CUSTOM">Custom Range</option>
                    </select>
                    
                    {filterType === 'PICK_MONTH' && (
                        <input 
                            type="month"
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs rounded-lg px-2 py-2 outline-none"
                        />
                    )}

                    {filterType === 'CUSTOM' && (
                        <div className="flex gap-2 animate-fade-in">
                            <input 
                                type="date" 
                                value={customStart}
                                onChange={(e) => setCustomStart(e.target.value)}
                                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs rounded-lg px-2 py-2 outline-none w-28"
                            />
                            <span className="self-center text-slate-400">-</span>
                            <input 
                                type="date" 
                                value={customEnd}
                                onChange={(e) => setCustomEnd(e.target.value)}
                                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs rounded-lg px-2 py-2 outline-none w-28"
                            />
                        </div>
                    )}
                </div>
                
                <div className="flex justify-between items-center">
                     <button
                        onClick={() => setSortType(prev => prev === 'DATE' ? 'AMOUNT' : 'DATE')}
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-300 active:scale-95 transition-transform"
                    >
                        <span>{sortType === 'DATE' ? '📅' : '💰'}</span>
                        <span>Sort by {sortType === 'DATE' ? 'Date' : 'Amount'}</span>
                    </button>

                    <button
                        onClick={handleExportCSV}
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 active:scale-95 transition-transform"
                    >
                        <span>📥</span>
                        <span>Export CSV</span>
                    </button>
                </div>
            </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto no-scrollbar space-y-6">
        {tab === 'HISTORY' ? (
            Object.keys(groupedExpenses).length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-400 dark:text-slate-500">
                    <div className="text-6xl mb-4 opacity-50">💸</div>
                    <p>No transactions found.</p>
                </div>
            ) : (
                Object.keys(groupedExpenses).map(groupKey => (
                    <div key={groupKey}>
                        <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3 ml-1 sticky top-0 bg-slate-50 dark:bg-slate-950 py-2 z-10 transition-colors backdrop-blur-sm bg-opacity-90 dark:bg-opacity-90">
                            {sortType === 'DATE' 
                                ? new Date(groupKey).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) 
                                : groupKey}
                        </h3>
                        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-800 border border-slate-100 dark:border-slate-800 overflow-hidden transition-colors">
                            {groupedExpenses[groupKey].map((expense, idx) => {
                                const isIncome = expense.type === 'INCOME';
                                return (
                                    <div key={expense.id} className={`flex items-center p-4 ${idx !== groupedExpenses[groupKey].length - 1 ? 'border-b border-slate-50 dark:border-slate-800' : ''}`}>
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl mr-4 shrink-0 ${isIncome ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-slate-50 dark:bg-slate-800'}`}>
                                            {getCategoryIcon(expense.category)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-slate-800 dark:text-white font-medium truncate">{expense.description}</h4>
                                            <div className="flex items-center gap-2">
                                                <p className="text-xs text-slate-500 dark:text-slate-400">{expense.category}</p>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end ml-4 shrink-0">
                                            <span className={`font-bold ${isIncome ? 'text-emerald-500' : 'text-slate-800 dark:text-white'}`}>
                                                {isIncome ? '+' : '-'}{formatMoney(expense.amount)}
                                            </span>
                                            <button 
                                                onClick={() => onDelete(expense.id)}
                                                className="text-[10px] text-red-400 hover:text-red-600 mt-1"
                                            >
                                                DELETE
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))
            )
        ) : (
            /* Recurring List */
            recurringExpenses.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-400 dark:text-slate-500">
                    <div className="text-6xl mb-4 opacity-50">📅</div>
                    <p>No recurring rules.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-4 py-3 rounded-xl text-xs leading-relaxed border border-blue-100 dark:border-blue-900/30">
                        These transactions will be automatically added to your history when due.
                    </div>
                    {recurringExpenses.map(rule => (
                        <div key={rule.id} className="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-800 border border-slate-100 dark:border-slate-800 p-4 flex items-center transition-colors">
                            <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-xl mr-4 shrink-0">
                                📅
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="text-slate-800 dark:text-white font-medium truncate">{rule.description}</h4>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${rule.type === 'INCOME' ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-600'}`}>
                                        {rule.frequency}
                                    </span>
                                    <span className="text-xs text-slate-500 dark:text-slate-400">
                                        Next: {rule.nextDueDate}
                                    </span>
                                </div>
                            </div>
                             <div className="flex flex-col items-end ml-4 shrink-0">
                                <span className={`font-bold ${rule.type === 'INCOME' ? 'text-emerald-500' : 'text-slate-800 dark:text-white'}`}>
                                    {formatMoney(rule.amount)}
                                </span>
                                <button 
                                    onClick={() => onDeleteRecurring(rule.id)}
                                    className="text-[10px] text-red-400 hover:text-red-600 mt-1 font-medium"
                                >
                                    STOP
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )
        )}
        </div>
    </div>
  );
};

export default ExpenseList;