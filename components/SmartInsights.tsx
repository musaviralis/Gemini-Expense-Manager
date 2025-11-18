
import React, { useEffect, useState } from 'react';
import { Expense } from '../types';
import { generateSpendingInsights } from '../services/geminiService';

interface SmartInsightsProps {
  expenses: Expense[];
  currency: string;
}

const SmartInsights: React.FC<SmartInsightsProps> = ({ expenses, currency }) => {
  const [insight, setInsight] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

  useEffect(() => {
    // Don't fetch if no expenses
    if (expenses.length === 0) return;
    
    const fetchInsight = async () => {
      setIsLoading(true);
      const result = await generateSpendingInsights(expenses, currency);
      setInsight(result);
      setIsLoading(false);
    };

    fetchInsight();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses.length, currency]); // Refetch if expense count or currency changes

  return (
    <div className="pb-24">
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-6 rounded-2xl text-white shadow-lg mb-6">
        <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-xl">
                🧠
            </div>
            <div>
                <h2 className="font-bold text-lg">AI Financial Advisor</h2>
                <p className="text-xs text-slate-400">Powered by Gemini</p>
            </div>
        </div>
        
        <div className="bg-white/5 rounded-xl p-4 border border-white/10 min-h-[100px] relative">
            {isLoading ? (
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="animate-pulse flex space-x-2">
                        <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-75"></div>
                        <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-150"></div>
                    </div>
                </div>
            ) : (
                <p className="text-sm leading-relaxed text-slate-200">
                    {insight || "Add more expenses to unlock detailed insights."}
                </p>
            )}
        </div>
        
        <div className="mt-4 flex justify-end">
            <button 
                onClick={async () => {
                    setIsLoading(true);
                    const result = await generateSpendingInsights(expenses, currency);
                    setInsight(result);
                    setIsLoading(false);
                }}
                className="text-xs font-medium text-indigo-300 hover:text-indigo-200 transition-colors"
            >
                Refresh Analysis
            </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm dark:shadow-slate-800 border border-slate-100 dark:border-slate-800 transition-colors">
            <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase mb-2">Highest Spend</h3>
            {expenses.length > 0 ? (
                <>
                    <p className="text-lg font-bold text-slate-800 dark:text-white truncate">
                        {expenses.sort((a,b) => b.amount - a.amount)[0].category}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Top category</p>
                </>
            ) : <p className="dark:text-white">-</p>}
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm dark:shadow-slate-800 border border-slate-100 dark:border-slate-800 transition-colors">
            <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase mb-2">Daily Avg</h3>
            {expenses.length > 0 ? (
                <>
                    <p className="text-lg font-bold text-slate-800 dark:text-white">
                       {formatMoney(expenses.reduce((a,b) => a + b.amount, 0) / (new Set(expenses.map(e => e.date)).size || 1))}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">per active day</p>
                </>
            ) : <p className="dark:text-white">-</p>}
        </div>
      </div>
    </div>
  );
};

export default SmartInsights;
