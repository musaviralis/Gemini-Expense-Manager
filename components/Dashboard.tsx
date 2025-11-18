
import React, { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, TooltipProps } from 'recharts';
import { Expense, CHART_COLORS, CategorySummary, CategoryLimit, EXPENSE_CATEGORIES, RecurringExpense, Goal, TransactionType } from '../types';
import { generateFinancialReport } from '../services/geminiService';

interface DashboardProps {
  expenses: Expense[];
  recurringExpenses: RecurringExpense[];
  currency: string;
  categoryLimits: CategoryLimit[];
  onSaveLimit: (category: string, limit: number) => void;
  sharedGoal: Goal | null;
  onUpdateGoal: (title: string, amount: number) => void;
  netBalance: number;
}

const Dashboard: React.FC<DashboardProps> = ({ 
    expenses, 
    recurringExpenses, 
    currency, 
    categoryLimits, 
    onSaveLimit, 
    sharedGoal, 
    onUpdateGoal,
    netBalance
}) => {
  const BUDGET_LIMIT = 2000; // Default monthly budget limit for spending
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [limitAmount, setLimitAmount] = useState('');
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalTitle, setGoalTitle] = useState('');
  const [goalTarget, setGoalTarget] = useState('');

  // AI Report State
  const [showReport, setShowReport] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportContent, setReportContent] = useState<string | null>(null);

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const CustomTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-slate-800 p-2 shadow-lg rounded border border-slate-100 dark:border-slate-700 text-xs">
          <p className="font-semibold text-slate-800 dark:text-white">{label || payload[0].name}</p>
          <p className="text-slate-600 dark:text-slate-300">{formatMoney(payload[0].value as number)}</p>
        </div>
      );
    }
    return null;
  };

  const totalSpent = useMemo(() => expenses.filter(e => e.type !== 'INCOME').reduce((sum, item) => sum + item.amount, 0), [expenses]);
  
  const isOverBudget = totalSpent > BUDGET_LIMIT;

  // --- Advanced Forecast Logic ---
  const forecast = useMemo(() => {
    const now = new Date();
    const currentMonthPrefix = now.toISOString().slice(0, 7); // YYYY-MM
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const currentDay = now.getDate();
    const daysRemaining = daysInMonth - currentDay;

    const monthlyExpenses = expenses.filter(e => e.date.startsWith(currentMonthPrefix) && e.type !== 'INCOME');
    const monthlyTotalSpent = monthlyExpenses.reduce((sum, e) => sum + e.amount, 0);
    
    if (currentDay === 0) return null;

    const dailyAverage = monthlyTotalSpent / currentDay;

    let pendingRecurringTotal = 0;
    const todayStr = now.toISOString().split('T')[0];
    const endOfMonthStr = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    
    recurringExpenses.forEach(rule => {
        if (rule.type === 'INCOME') return; 
        let nextDate = rule.nextDueDate;
        if (nextDate > todayStr && nextDate <= endOfMonthStr) {
            pendingRecurringTotal += rule.amount;
            if (rule.frequency === 'WEEKLY' || rule.frequency === 'DAILY') {
                let d = new Date(nextDate);
                while(true) {
                     if (rule.frequency === 'WEEKLY') d.setDate(d.getDate() + 7);
                     else if (rule.frequency === 'DAILY') d.setDate(d.getDate() + 1);
                     
                     const dStr = d.toISOString().split('T')[0];
                     if (dStr <= endOfMonthStr) pendingRecurringTotal += rule.amount;
                     else break;
                }
            }
        }
    });

    const projectedTotal = monthlyTotalSpent + (dailyAverage * daysRemaining);

    const trendingOver = projectedTotal > BUDGET_LIMIT;

    return {
      projectedTotal,
      trendingOver,
      dailyAverage,
      daysRemaining,
      monthName: now.toLocaleDateString(undefined, { month: 'long' }),
      pendingRecurringTotal
    };
  }, [expenses, recurringExpenses]);

  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    expenses.filter(e => e.type !== 'INCOME').forEach(e => {
      map.set(e.category, (map.get(e.category) || 0) + e.amount);
    });
    
    const data: CategorySummary[] = [];
    let index = 0;
    map.forEach((value, key) => {
      data.push({ name: key, value, color: CHART_COLORS[index % CHART_COLORS.length] });
      index++;
    });
    return data.sort((a, b) => b.value - a.value);
  }, [expenses]);

  // Calculate budget items
  const budgetItems = useMemo(() => {
    const spendingMap = new Map<string, number>();
    const currentMonthPrefix = new Date().toISOString().slice(0, 7);
    
    expenses
      .filter(e => e.date.startsWith(currentMonthPrefix) && e.type !== 'INCOME')
      .forEach(e => {
        spendingMap.set(e.category, (spendingMap.get(e.category) || 0) + e.amount);
      });

    const activeCategories = new Set([...EXPENSE_CATEGORIES]);
    
    return Array.from(activeCategories).map(cat => {
        const spent = spendingMap.get(cat) || 0;
        const limitObj = categoryLimits.find(l => l.category === cat);
        const limit = limitObj ? limitObj.limit : 0;
        return { category: cat, spent, limit };
    }).filter(item => item.spent > 0 || item.limit > 0)
    .sort((a, b) => {
        const aPct = a.limit > 0 ? a.spent / a.limit : 0;
        const bPct = b.limit > 0 ? b.spent / b.limit : 0;
        if (a.limit > 0 && b.limit > 0) return bPct - aPct;
        return b.spent - a.spent;
    });
  }, [expenses, categoryLimits]);

  const handleEditClick = (category: string, currentLimit: number) => {
    setEditingCategory(category);
    setLimitAmount(currentLimit > 0 ? currentLimit.toString() : '');
  };

  const handleSaveCategory = () => {
    if (editingCategory) {
      const val = parseFloat(limitAmount);
      onSaveLimit(editingCategory, isNaN(val) ? 0 : val);
      setEditingCategory(null);
    }
  };

  const handleGoalSave = () => {
      if(goalTitle && goalTarget) {
          onUpdateGoal(goalTitle, parseFloat(goalTarget));
          setEditingGoal(false);
      }
  };

  const startEditingGoal = () => {
      setGoalTitle(sharedGoal?.title || '');
      setGoalTarget(sharedGoal?.targetAmount.toString() || '');
      setEditingGoal(true);
  };

  const handleGenerateReport = async () => {
      setReportLoading(true);
      setShowReport(true);
      const report = await generateFinancialReport(expenses, currency);
      setReportContent(report);
      setReportLoading(false);
  };

  return (
    <div className="space-y-6 pb-24 relative">
      {/* Modal for Editing Category Limit */}
      {editingCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl w-full max-w-xs shadow-2xl">
            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-1">Set Limit</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Budget for {editingCategory}</p>
            <input 
              type="number" 
              value={limitAmount}
              onChange={(e) => setLimitAmount(e.target.value)}
              placeholder="0.00"
              className="w-full text-2xl font-bold p-2 border-b-2 border-indigo-500 bg-transparent outline-none mb-6 text-slate-800 dark:text-white placeholder-slate-300"
              autoFocus
            />
            <div className="flex gap-3">
              <button 
                onClick={() => setEditingCategory(null)}
                className="flex-1 py-3 rounded-xl text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 font-medium"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveCategory}
                className="flex-1 py-3 rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 font-medium shadow-lg shadow-indigo-200 dark:shadow-none"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal for Editing Shared Goal */}
      {editingGoal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl w-full max-w-xs shadow-2xl">
            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4">Set Financial Goal</h3>
            <input 
              type="text" 
              value={goalTitle}
              onChange={(e) => setGoalTitle(e.target.value)}
              placeholder="Goal Name (e.g. Vacation)"
              className="w-full p-3 mb-4 bg-slate-100 dark:bg-slate-700 rounded-xl outline-none"
              autoFocus
            />
            <input 
              type="number" 
              value={goalTarget}
              onChange={(e) => setGoalTarget(e.target.value)}
              placeholder="Target Amount"
              className="w-full p-3 mb-6 bg-slate-100 dark:bg-slate-700 rounded-xl outline-none"
            />
            <div className="flex gap-3">
              <button 
                onClick={() => setEditingGoal(false)}
                className="flex-1 py-3 rounded-xl text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 font-medium"
              >
                Cancel
              </button>
              <button 
                onClick={handleGoalSave}
                className="flex-1 py-3 rounded-xl text-white bg-emerald-600 hover:bg-emerald-700 font-medium shadow-lg shadow-emerald-200 dark:shadow-none"
              >
                Set Goal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {showReport && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fade-in">
              <div className="bg-white dark:bg-slate-800 w-full max-w-lg max-h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                  <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
                      <h3 className="text-lg font-bold flex items-center gap-2">
                          <span>🤖</span> AI Financial Advisor
                      </h3>
                      <button 
                          onClick={() => setShowReport(false)}
                          className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                      >
                          ✕
                      </button>
                  </div>
                  <div className="p-6 overflow-y-auto flex-1">
                      {reportLoading ? (
                          <div className="flex flex-col items-center justify-center py-12 space-y-4">
                              <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                              <p className="text-slate-500 dark:text-slate-400 text-sm animate-pulse">Analyzing 6 months of data...</p>
                          </div>
                      ) : (
                          <div className="prose dark:prose-invert prose-sm max-w-none">
                             <div className="whitespace-pre-wrap leading-relaxed text-slate-700 dark:text-slate-300 font-medium">
                                {reportContent}
                             </div>
                          </div>
                      )}
                  </div>
                  <div className="p-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                       <button 
                          onClick={() => setShowReport(false)}
                          className="w-full py-3 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold"
                       >
                          Close Analysis
                       </button>
                  </div>
              </div>
          </div>
      )}

      {/* Net Balance Card */}
      <div className={`p-6 rounded-2xl shadow-lg transition-all duration-500 relative overflow-hidden ${netBalance >= 0 ? 'bg-gradient-to-r from-emerald-600 to-teal-600 shadow-emerald-200 dark:shadow-none' : 'bg-gradient-to-r from-rose-600 to-orange-600 shadow-rose-200 dark:shadow-none'}`}>
        <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
        <div className="relative z-10 text-white">
            <div className="flex justify-between items-start">
                <h2 className="text-sm font-medium uppercase tracking-wide opacity-90">Net Available Funds</h2>
                <span className="text-xs bg-white/20 px-2 py-1 rounded-lg font-medium backdrop-blur-sm">Current</span>
            </div>
            <div className="text-4xl font-bold mt-2 tracking-tight">
              {formatMoney(netBalance)}
            </div>
            <p className="mt-2 text-xs opacity-80">
                Income - Expenses
            </p>
        </div>
      </div>

      {/* Generate AI Report Button */}
      <button 
        onClick={handleGenerateReport}
        className="w-full py-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold shadow-lg shadow-indigo-200 dark:shadow-none flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all"
      >
          <span className="text-xl">✨</span>
          <span>Generate AI Summary</span>
      </button>

      {/* Shared Financial Goal Card */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-xl shadow-sm dark:shadow-slate-800 border border-slate-100 dark:border-slate-800 transition-colors">
        <div className="flex justify-between items-start mb-3">
            <div>
                <h3 className="text-slate-800 dark:text-white font-bold">
                    {sharedGoal ? sharedGoal.title : 'Set a Savings Goal'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {sharedGoal ? 'Community Goal Progress' : 'Track your savings target publicly'}
                </p>
            </div>
            <button onClick={startEditingGoal} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                <span className="text-lg">🎯</span>
            </button>
        </div>
        
        {sharedGoal ? (
            <div>
                <div className="flex justify-between text-sm font-medium mb-2">
                    <span className={netBalance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}>
                        {formatMoney(netBalance)}
                    </span>
                    <span className="text-slate-400">Target: {formatMoney(sharedGoal.targetAmount)}</span>
                </div>
                <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div 
                        className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-1000 ease-out" 
                        style={{ width: `${Math.max(0, Math.min(100, (netBalance / sharedGoal.targetAmount) * 100))}%` }}
                    ></div>
                </div>
                <p className="text-xs text-center mt-2 text-slate-400">
                    {netBalance >= sharedGoal.targetAmount ? '🎉 Goal Reached!' : `${Math.round((netBalance / sharedGoal.targetAmount) * 100)}% achieved`}
                </p>
            </div>
        ) : (
            <button onClick={startEditingGoal} className="w-full py-3 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-slate-400 text-sm font-medium hover:border-indigo-400 hover:text-indigo-500 transition-colors">
                + Add New Goal
            </button>
        )}
      </div>

      {/* Smart Forecast Card */}
      {forecast && (
        <div className={`p-5 rounded-xl border transition-colors ${
            forecast.trendingOver 
            ? 'bg-rose-50 dark:bg-rose-900/20 border-rose-100 dark:border-rose-800/30' 
            : 'bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800/30'
        }`}>
            <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{forecast.trendingOver ? '📉' : '🔮'}</span>
                <h3 className={`font-bold text-sm ${forecast.trendingOver ? 'text-rose-700 dark:text-rose-400' : 'text-blue-700 dark:text-blue-400'}`}>
                    {forecast.monthName} Spending Forecast
                </h3>
            </div>
            <p className={`text-xs leading-relaxed ${forecast.trendingOver ? 'text-rose-800 dark:text-rose-300' : 'text-blue-800 dark:text-blue-300'}`}>
                Based on your activity, you are projected to spend <b>{formatMoney(forecast.projectedTotal)}</b>.
            </p>
            
            {forecast.pendingRecurringTotal > 0 && (
                <div className="mt-3 pt-3 border-t border-black/5 dark:border-white/10">
                    <p className="text-[10px] font-bold uppercase tracking-wide opacity-70 mb-1">Upcoming Fixed Bills</p>
                    <p className="text-sm font-bold">+{formatMoney(forecast.pendingRecurringTotal)}</p>
                    <p className="text-[10px] opacity-70">automatically included in forecast</p>
                </div>
            )}
        </div>
      )}

      {/* Category Budgets Card */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-xl shadow-sm dark:shadow-slate-800 border border-slate-100 dark:border-slate-800 transition-colors">
        <div className="flex justify-between items-center mb-4">
            <h3 className="text-slate-800 dark:text-white font-semibold">Budgets</h3>
            <button 
                onClick={() => handleEditClick(EXPENSE_CATEGORIES[0], 0)}
                className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-1 rounded-lg"
            >
                + Set Limit
            </button>
        </div>
        <div className="space-y-4">
            {budgetItems.length > 0 ? budgetItems.map(item => {
                const percentage = item.limit > 0 ? Math.min((item.spent / item.limit) * 100, 100) : 0;
                const isOver = item.limit > 0 && item.spent > item.limit;
                
                let barColor = 'bg-emerald-500';
                let textColor = 'text-emerald-600 dark:text-emerald-400';
                if (percentage > 80) {
                    barColor = 'bg-amber-500';
                    textColor = 'text-amber-600 dark:text-amber-400';
                }
                if (isOver) {
                    barColor = 'bg-red-500';
                    textColor = 'text-red-600 dark:text-red-400';
                }

                return (
                    <div key={item.category} onClick={() => handleEditClick(item.category, item.limit)} className="cursor-pointer group">
                        <div className="flex justify-between items-end mb-1.5">
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-200 group-hover:text-indigo-600 transition-colors">{item.category}</span>
                            {item.limit > 0 ? (
                                <span className={`text-xs font-bold ${textColor}`}>
                                    {formatMoney(item.spent)} <span className="text-slate-400 font-normal">/ {formatMoney(item.limit)}</span>
                                </span>
                            ) : (
                                <span className="text-xs text-slate-400 group-hover:text-indigo-500">Set Limit</span>
                            )}
                        </div>
                        {item.limit > 0 ? (
                            <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div 
                                    className={`h-full rounded-full transition-all duration-500 ${barColor}`} 
                                    style={{ width: `${percentage}%` }}
                                ></div>
                            </div>
                        ) : (
                             <div className="w-full h-1 bg-slate-50 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full bg-slate-200 dark:bg-slate-700 w-full"></div>
                             </div>
                        )}
                    </div>
                );
            }) : (
                <p className="text-sm text-slate-400 text-center py-4">No spending data yet.</p>
            )}
        </div>
      </div>

      {/* Chart Section */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-xl shadow-sm dark:shadow-slate-800 border border-slate-100 dark:border-slate-800 transition-colors">
        <h3 className="text-slate-800 dark:text-white font-semibold mb-4">Expense Breakdown</h3>
        {categoryData.length > 0 ? (
          <div className="h-64 w-full">
             <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
            No expenses to display
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
