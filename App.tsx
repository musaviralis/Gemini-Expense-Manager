
import React, { useState, useEffect, useMemo } from 'react';
import { Expense, View, CURRENCIES, Frequency, RecurringExpense, CategoryLimit, Goal, TransactionType } from './types';
import Dashboard from './components/Dashboard';
import ExpenseForm from './components/ExpenseForm';
import ExpenseList from './components/ExpenseList';
import SmartInsights from './components/SmartInsights';
import { 
  initFirebase, 
  subscribeToExpenses, 
  addExpenseToDb, 
  deleteExpenseFromDb, 
  subscribeToRecurring, 
  addRecurringToDb, 
  deleteRecurringFromDb,
  processRecurringBatch,
  subscribeToCategoryLimits,
  saveCategoryLimit,
  subscribeToSharedGoal,
  updateSharedGoal
} from './services/firebaseService';
import { User } from 'firebase/auth';

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<View>(View.DASHBOARD);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([]);
  const [categoryLimits, setCategoryLimits] = useState<CategoryLimit[]>([]);
  const [sharedGoal, setSharedGoal] = useState<Goal | null>(null);
  const [currency, setCurrency] = useState<string>('USD');
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // --- Initialization ---

  useEffect(() => {
    const init = async () => {
      const u = await initFirebase();
      setUser(u);
      setIsLoading(false);
    };
    init();

    // Load local prefs
    const savedCurrency = localStorage.getItem('gemini_currency');
    if (savedCurrency) setCurrency(savedCurrency);

    // Enforce dark mode
    document.documentElement.classList.add('dark');
  }, []);

  // --- Subscriptions ---

  useEffect(() => {
    if (!user) return;

    const unsubExpenses = subscribeToExpenses((data) => setExpenses(data));
    const unsubRecurring = subscribeToRecurring((data) => setRecurringExpenses(data));
    const unsubLimits = subscribeToCategoryLimits((data) => setCategoryLimits(data));
    const unsubGoal = subscribeToSharedGoal((data) => setSharedGoal(data));

    return () => {
      unsubExpenses();
      unsubRecurring();
      unsubLimits();
      unsubGoal();
    };
  }, [user]);

  // --- Persistence ---

  useEffect(() => {
    localStorage.setItem('gemini_currency', currency);
  }, [currency]);

  // --- Recurring Logic ---

  useEffect(() => {
    if (recurringExpenses.length === 0 || !user) return;

    const today = new Date().toISOString().split('T')[0];
    let newExpensesToAdd: Expense[] = [];
    let updatedRules: RecurringExpense[] = [];
    let hasChanges = false;

    const calculateNextDate = (dateStr: string, freq: Frequency): string => {
      const date = new Date(dateStr);
      switch(freq) {
        case Frequency.DAILY: date.setDate(date.getDate() + 1); break;
        case Frequency.WEEKLY: date.setDate(date.getDate() + 7); break;
        case Frequency.MONTHLY: date.setMonth(date.getMonth() + 1); break;
        case Frequency.YEARLY: date.setFullYear(date.getFullYear() + 1); break;
        default: return dateStr;
      }
      return date.toISOString().split('T')[0];
    };

    recurringExpenses.forEach(rule => {
        let nextDate = rule.nextDueDate;
        let ruleChanged = false;
        let safetyCounter = 0;

        // Only generate past or due items
        while (nextDate <= today && safetyCounter < 12) {
            const newExpense: Expense = {
                id: crypto.randomUUID(),
                amount: rule.amount,
                category: rule.category,
                description: `${rule.description} (Recurring)`,
                date: nextDate,
                timestamp: new Date(nextDate).getTime(),
                type: rule.type || 'EXPENSE'
            };
            newExpensesToAdd.push(newExpense);
            
            nextDate = calculateNextDate(nextDate, rule.frequency);
            ruleChanged = true;
            hasChanges = true;
            safetyCounter++;
        }

        if (ruleChanged) {
            updatedRules.push({ ...rule, nextDueDate: nextDate });
        } else {
            updatedRules.push(rule); // No change needed, but need to keep it in the array if we were doing full replace
        }
    });

    if (hasChanges) {
        console.log(`Processing ${newExpensesToAdd.length} new recurring items.`);
        // We only need to pass the changed rules to update
        const changedRules = updatedRules.filter(r => {
            const original = recurringExpenses.find(or => or.id === r.id);
            return original && original.nextDueDate !== r.nextDueDate;
        });
        processRecurringBatch(newExpensesToAdd, changedRules);
    }
  }, [recurringExpenses, user]);

  // --- Derived State ---

  const netBalance = useMemo(() => {
    const income = expenses.filter(e => e.type === 'INCOME').reduce((sum, e) => sum + e.amount, 0);
    const expense = expenses.filter(e => e.type !== 'INCOME').reduce((sum, e) => sum + e.amount, 0);
    return income - expense;
  }, [expenses]);

  // --- Handlers ---

  const addExpense = (data: Omit<Expense, 'id' | 'timestamp'>, frequency: Frequency) => {
    const calculateNextDate = (dateStr: string, freq: Frequency): string => {
        const date = new Date(dateStr);
        switch(freq) {
          case Frequency.DAILY: date.setDate(date.getDate() + 1); break;
          case Frequency.WEEKLY: date.setDate(date.getDate() + 7); break;
          case Frequency.MONTHLY: date.setMonth(date.getMonth() + 1); break;
          case Frequency.YEARLY: date.setFullYear(date.getFullYear() + 1); break;
          default: return dateStr;
        }
        return date.toISOString().split('T')[0];
    };

    const newExpense: Expense = {
      ...data,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: data.type || 'EXPENSE'
    };

    addExpenseToDb(newExpense);

    if (frequency !== Frequency.ONCE) {
        const nextDate = calculateNextDate(data.date, frequency);
        const newRule: RecurringExpense = {
            id: crypto.randomUUID(),
            amount: data.amount,
            category: data.category,
            description: data.description,
            frequency,
            nextDueDate: nextDate,
            type: data.type || 'EXPENSE'
        };
        addRecurringToDb(newRule);
    }

    setActiveView(View.DASHBOARD);
  };

  const deleteExpense = (id: string) => {
    if (window.confirm("Delete this transaction?")) {
        deleteExpenseFromDb(id);
    }
  };

  const deleteRecurringRule = (id: string) => {
      if (window.confirm("Stop this recurring transaction?")) {
          deleteRecurringFromDb(id);
      }
  };

  const handleSaveGoal = (title: string, amount: number) => {
      updateSharedGoal(title, amount);
  };

  // --- Render ---

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-indigo-600">
         <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-current"></div>
            <p className="animate-pulse text-sm font-medium">Syncing Securely...</p>
         </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeView) {
      case View.DASHBOARD:
        return (
            <Dashboard 
                expenses={expenses} 
                recurringExpenses={recurringExpenses}
                currency={currency} 
                categoryLimits={categoryLimits}
                onSaveLimit={saveCategoryLimit}
                sharedGoal={sharedGoal}
                onUpdateGoal={handleSaveGoal}
                netBalance={netBalance}
            />
        );
      case View.ADD:
        return <ExpenseForm onAdd={addExpense} onCancel={() => setActiveView(View.DASHBOARD)} currency={currency} expenses={expenses} />;
      case View.HISTORY:
        return (
            <ExpenseList 
                expenses={expenses} 
                recurringExpenses={recurringExpenses}
                onDelete={deleteExpense} 
                onDeleteRecurring={deleteRecurringRule}
                currency={currency} 
            />
        );
      case View.INSIGHTS:
        return <SmartInsights expenses={expenses} currency={currency} />;
      default:
        return (
            <Dashboard 
                expenses={expenses} 
                recurringExpenses={recurringExpenses}
                currency={currency} 
                categoryLimits={categoryLimits}
                onSaveLimit={saveCategoryLimit}
                sharedGoal={sharedGoal}
                onUpdateGoal={handleSaveGoal}
                netBalance={netBalance}
            />
        );
    }
  };

  return (
    <div className="dark h-full w-full">
      <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-300">
        {/* Mobile Header */}
        <header className="bg-white dark:bg-slate-900 px-6 py-4 shadow-sm dark:shadow-slate-900 z-20 flex justify-between items-center sticky top-0 transition-colors">
          <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold shadow-md shadow-indigo-200 dark:shadow-none">G</div>
              <div>
                <h1 className="text-lg font-bold text-slate-800 dark:text-white leading-tight">Expense Mgr</h1>
                <p className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${user ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                  {user ? `ID: ${user.uid.slice(0, 4)}...` : ''}
                </p>
              </div>
          </div>
          <div className="flex items-center gap-3">
             <select 
               value={currency}
               onChange={(e) => setCurrency(e.target.value)}
               className="text-xs font-medium bg-slate-100 dark:bg-slate-800 border-none rounded px-2 py-1 text-slate-600 dark:text-slate-300 outline-none focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900 cursor-pointer transition-colors"
             >
               {CURRENCIES.map(c => (
                 <option key={c.code} value={c.code}>{c.code}</option>
               ))}
             </select>
          </div>
        </header>

        {/* Main Content Scrollable Area */}
        <main className="flex-1 overflow-y-auto px-4 pt-6 no-scrollbar">
          <div className="max-w-md mx-auto h-full">
              {renderContent()}
          </div>
        </main>

        {/* Bottom Navigation Bar */}
        <nav className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] dark:shadow-none h-16 fixed bottom-0 w-full z-30 max-w-[100vw] transition-colors">
          <div className="max-w-md mx-auto h-full grid grid-cols-4 relative">
              {/* Floating Action Button for ADD */}
              <div className="absolute -top-6 left-1/2 -translate-x-1/2">
                  <button
                      onClick={() => setActiveView(View.ADD)}
                      className={`w-14 h-14 rounded-full shadow-lg shadow-indigo-200 dark:shadow-indigo-900 flex items-center justify-center transition-transform active:scale-95 ${activeView === View.ADD ? 'bg-slate-800 dark:bg-slate-700 text-white' : 'bg-indigo-600 text-white'}`}
                  >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                  </button>
              </div>

              <NavButton 
                  icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />}
                  label="Home" 
                  isActive={activeView === View.DASHBOARD} 
                  onClick={() => setActiveView(View.DASHBOARD)} 
              />
              
              <div className="flex justify-center items-center">
                  {/* Spacer for FAB */}
              </div>
               <div className="flex justify-center items-center">
                  {/* Spacer for FAB alignment visually */}
              </div>

              <NavButton 
                  icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />}
                  label="History" 
                  isActive={activeView === View.HISTORY} 
                  onClick={() => setActiveView(View.HISTORY)} 
              />
              
              <NavButton 
                  icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />}
                  label="Insights" 
                  isActive={activeView === View.INSIGHTS} 
                  onClick={() => setActiveView(View.INSIGHTS)} 
              />
          </div>
        </nav>
      </div>
    </div>
  );
};

const NavButton: React.FC<{ icon: React.ReactNode; label: string; isActive: boolean; onClick: () => void }> = ({ icon, label, isActive, onClick }) => (
    <button 
        onClick={onClick}
        className={`flex flex-col items-center justify-center h-full w-full ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
    >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {icon}
        </svg>
        <span className="text-[10px] font-medium">{label}</span>
    </button>
);

export default App;
