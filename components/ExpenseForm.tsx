
import React, { useState, useMemo } from 'react';
import { Expense, EXPENSE_CATEGORIES, INCOME_CATEGORIES, CURRENCIES, Frequency, TransactionType } from '../types';
import { parseExpenseFromText, predictCategory, suggestDescription } from '../services/geminiService';

interface ExpenseFormProps {
  onAdd: (expense: Omit<Expense, 'id' | 'timestamp'>, frequency: Frequency) => void;
  onCancel: () => void;
  currency: string;
  expenses: Expense[];
}

const ExpenseForm: React.FC<ExpenseFormProps> = ({ onAdd, onCancel, currency, expenses }) => {
  const [mode, setMode] = useState<'MANUAL' | 'AI'>('MANUAL');
  const [isLoading, setIsLoading] = useState(false);
  const [isPredictingCategory, setIsPredictingCategory] = useState(false);
  const [isSuggestingDescription, setIsSuggestingDescription] = useState(false);

  // Manual State
  const [type, setType] = useState<TransactionType>('EXPENSE');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState<Frequency>(Frequency.MONTHLY);

  // AI State
  const [aiInput, setAiInput] = useState('');

  const currencySymbol = CURRENCIES.find(c => c.code === currency)?.symbol || '$';
  const activeCategories = type === 'EXPENSE' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  // Category Insight Logic
  const categoryInsight = useMemo(() => {
    // Only relevant for Expenses
    if (type === 'INCOME' || expenses.length < 5) return null;
    
    const counts: Record<string, number> = {};
    expenses
      .filter(e => e.type !== 'INCOME')
      .forEach(e => {
        counts[e.category] = (counts[e.category] || 0) + 1;
    });
    
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) return null;
    
    const topCategory = sorted[0][0];
    const count = sorted[0][1];
    
    return { category: topCategory, count };
  }, [expenses, type]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !category) return;
    
    const finalDate = date ? date : new Date().toISOString().split('T')[0];

    onAdd({
      amount: parseFloat(amount),
      category,
      description: description || category,
      date: finalDate,
      type
    }, isRecurring ? frequency : Frequency.ONCE);
  };

  const handleDescriptionBlur = async () => {
    if (!description.trim() || mode !== 'MANUAL' || type === 'INCOME') return;
    
    setIsPredictingCategory(true);
    try {
        const predictedCategory = await predictCategory(description);
        if (predictedCategory) {
            setCategory(predictedCategory);
        }
    } catch (error) {
        console.error("Failed to predict category", error);
    } finally {
        setIsPredictingCategory(false);
    }
  };

  const handleSuggestDescription = async () => {
    if (!amount || !category) {
        alert("Please enter an amount and category first.");
        return;
    }
    setIsSuggestingDescription(true);
    try {
        const suggestion = await suggestDescription(category, amount, currencySymbol);
        if (suggestion) {
            setDescription(suggestion);
        }
    } catch (error) {
        console.error("Failed to suggest description", error);
    } finally {
        setIsSuggestingDescription(false);
    }
  };

  const handleAiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiInput.trim()) return;

    setIsLoading(true);
    try {
        const result = await parseExpenseFromText(aiInput);
        if (result && result.amount && result.category) {
            const finalFreq = result.frequency || Frequency.ONCE;
            const isRec = finalFreq !== Frequency.ONCE;
            
            setAmount(result.amount.toString());
            setCategory(result.category);
            setDescription(result.description || 'AI Generated');
            setDate(result.date || new Date().toISOString().split('T')[0]);
            if (isRec) {
                setIsRecurring(true);
                setFrequency(finalFreq);
            } else {
                setIsRecurring(false);
            }
            // AI currently optimized for Expenses, but let's assume it's expense for now
            setType('EXPENSE'); 
            setMode('MANUAL');
        } else {
            alert('Could not understand the input. Please try again.');
        }
    } catch (err) {
        console.error(err);
        alert('AI Service error.');
    } finally {
        setIsLoading(false);
    }
  };

  const isTopCategory = categoryInsight && category === categoryInsight.category;

  return (
    <div className="pb-24 animate-fade-in">
      <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-6 px-1">New Transaction</h2>
      
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm dark:shadow-slate-800 border border-slate-100 dark:border-slate-800 overflow-hidden transition-colors">
        <div className="flex border-b border-slate-100 dark:border-slate-800">
            <button 
                onClick={() => setMode('MANUAL')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${mode === 'MANUAL' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
            >
                Manual
            </button>
            <button 
                onClick={() => setMode('AI')}
                className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${mode === 'AI' ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
            >
                <span>✨ AI Magic</span>
            </button>
        </div>

        <div className="p-6">
            {mode === 'MANUAL' ? (
                <form onSubmit={handleManualSubmit} className="space-y-5">
                    {/* Type Switcher */}
                    <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mb-4">
                        <button
                            type="button"
                            onClick={() => { setType('EXPENSE'); setCategory(EXPENSE_CATEGORIES[0]); }}
                            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${type === 'EXPENSE' ? 'bg-white dark:bg-slate-700 text-red-500 shadow-sm' : 'text-slate-400'}`}
                        >
                            Expense
                        </button>
                        <button
                            type="button"
                            onClick={() => { setType('INCOME'); setCategory(INCOME_CATEGORIES[0]); }}
                            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${type === 'INCOME' ? 'bg-white dark:bg-slate-700 text-emerald-500 shadow-sm' : 'text-slate-400'}`}
                        >
                            Income
                        </button>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">Amount ({currencySymbol})</label>
                        <input 
                            type="number" 
                            step="0.01"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className={`w-full text-3xl font-bold placeholder-slate-200 dark:placeholder-slate-700 border-b-2 border-slate-100 dark:border-slate-700 outline-none py-2 bg-transparent transition-colors ${type === 'INCOME' ? 'text-emerald-500 focus:border-emerald-500' : 'text-slate-800 dark:text-white focus:border-red-500'}`}
                            placeholder="0.00"
                            required
                            autoFocus
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1 flex justify-between items-center">
                            <span>Category</span>
                            {isPredictingCategory && (
                                <span className="text-indigo-500 dark:text-indigo-400 text-[10px] animate-pulse flex items-center gap-1">
                                    ✨ Auto-categorizing...
                                </span>
                            )}
                        </label>
                        <select 
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            className={`w-full p-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900 transition-all ${isPredictingCategory ? 'opacity-50' : ''}`}
                            disabled={isPredictingCategory}
                        >
                            {activeCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                        </select>
                    </div>

                    {/* Behavioral Feedback Insight */}
                    {isTopCategory && (
                        <div className="animate-fade-in bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/30 p-3 rounded-xl flex items-start gap-3">
                            <div className="text-lg">💡</div>
                            <div>
                                <p className="text-xs font-bold text-yellow-800 dark:text-yellow-300 uppercase mb-0.5">Spending Habit</p>
                                <p className="text-xs text-yellow-700 dark:text-yellow-400">
                                    Most frequent: {categoryInsight.count} times.
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">Date</label>
                            <input 
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="w-full p-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900"
                            />
                        </div>
                        <div>
                             <label className="block text-xs font-semibold text-slate-500 uppercase mb-1 opacity-0">Type</label>
                             <div className={`flex items-center h-[46px] rounded-xl px-3 transition-colors border ${isRecurring ? 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-700' : 'bg-slate-50 border-transparent dark:bg-slate-800'}`}>
                                <input 
                                    type="checkbox"
                                    id="recurring"
                                    checked={isRecurring}
                                    onChange={(e) => setIsRecurring(e.target.checked)}
                                    className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400 border-gray-300 dark:border-slate-600 dark:bg-slate-700"
                                />
                                <label htmlFor="recurring" className={`ml-2 text-sm font-medium select-none cursor-pointer ${isRecurring ? 'text-amber-800 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300'}`}>Recurring?</label>
                             </div>
                        </div>
                    </div>

                    {isRecurring && (
                        <div className="animate-fade-in bg-amber-50 dark:bg-amber-900/10 p-4 rounded-xl border-2 border-amber-300 dark:border-amber-600 shadow-sm relative overflow-hidden">
                            <label className="block text-xs font-bold text-amber-700 dark:text-amber-400 uppercase mb-2">Repeat Frequency</label>
                            <select 
                                value={frequency}
                                onChange={(e) => setFrequency(e.target.value as Frequency)}
                                className="w-full p-3 bg-white dark:bg-slate-800 rounded-lg text-slate-800 dark:text-slate-200 font-medium outline-none border-2 border-amber-300 dark:border-amber-600 focus:border-amber-500 dark:focus:border-amber-500 transition-all"
                            >
                                <option value={Frequency.DAILY}>Daily</option>
                                <option value={Frequency.WEEKLY}>Weekly</option>
                                <option value={Frequency.MONTHLY}>Monthly</option>
                                <option value={Frequency.YEARLY}>Yearly</option>
                            </select>
                            <p className="text-xs text-amber-700 dark:text-amber-500/80 mt-2 flex items-center gap-1">
                                <span>ℹ️</span> Auto-add this {type === 'INCOME' ? 'income' : 'expense'} every {frequency.toLowerCase()}.
                            </p>
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">Description (Optional)</label>
                        <div className="relative">
                            <input 
                                type="text"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                onBlur={handleDescriptionBlur}
                                placeholder={type === 'INCOME' ? 'Paycheck, Bonus...' : 'Lunch, Taxi...'}
                                className="w-full p-3 pr-12 bg-slate-50 dark:bg-slate-800 rounded-xl text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900 transition-all"
                            />
                            <button
                                type="button"
                                onClick={handleSuggestDescription}
                                disabled={isSuggestingDescription || !amount || type === 'INCOME'}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors disabled:opacity-50"
                            >
                                {isSuggestingDescription ? (
                                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                ) : (
                                    <span className="text-xl">🪄</span>
                                )}
                            </button>
                        </div>
                    </div>

                    <div className="pt-4">
                        <button 
                            type="submit" 
                            className={`w-full text-white font-semibold py-4 rounded-xl shadow-lg transition-all active:scale-[0.98] ${type === 'INCOME' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200 dark:shadow-none' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200 dark:shadow-none'}`}
                        >
                            Save {type === 'INCOME' ? 'Income' : 'Expense'}
                        </button>
                    </div>
                </form>
            ) : (
                <form onSubmit={handleAiSubmit} className="space-y-6">
                     {/* AI Section simplified for brevity */}
                    <div className="text-center space-y-2 mb-6">
                        <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-full flex items-center justify-center mx-auto text-xl">
                            ✨
                        </div>
                        <h3 className="font-medium text-slate-800 dark:text-white">Describe your transaction</h3>
                    </div>

                    <textarea 
                        value={aiInput}
                        onChange={(e) => setAiInput(e.target.value)}
                        placeholder={`e.g., Paid 120 ${currencySymbol} for electricity...`}
                        className="w-full h-32 p-4 bg-slate-50 dark:bg-slate-800 rounded-xl text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-purple-100 dark:focus:ring-purple-900 resize-none"
                        autoFocus
                    />

                    <button 
                        type="submit" 
                        disabled={isLoading || !aiInput.trim()}
                        className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-4 rounded-xl flex items-center justify-center gap-2"
                    >
                        {isLoading ? <span>Processing...</span> : <span>Process with AI</span>}
                    </button>
                </form>
            )}
        </div>
      </div>
    </div>
  );
};

export default ExpenseForm;