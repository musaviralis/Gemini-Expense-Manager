
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  writeBatch,
  query,
  getDocs
} from 'firebase/firestore';
import { getAuth, signInWithCustomToken, User } from 'firebase/auth';
import { Expense, RecurringExpense, CategoryLimit, Goal } from '../types';

declare global {
  interface Window {
    __app_id?: string;
    __firebase_config?: any;
    __initial_auth_token?: string;
  }
}

let db: any = null;
let auth: any = null;
let appId: string = 'default_app';
let userId: string | null = null;

export const initFirebase = async (): Promise<User | null> => {
  if (!window.__firebase_config) {
    console.warn("No firebase config found in global window object.");
    return null;
  }

  try {
    const app = initializeApp(window.__firebase_config);
    db = getFirestore(app);
    auth = getAuth(app);
    appId = window.__app_id || 'default_app';

    if (window.__initial_auth_token) {
        const userCredential = await signInWithCustomToken(auth, window.__initial_auth_token);
        userId = userCredential.user.uid;
        return userCredential.user;
    }
    return auth.currentUser;
  } catch (error) {
    console.error("Firebase Initialization Error:", error);
    return null;
  }
};

// --- Paths ---
const getUserPath = () => {
  if (!userId) throw new Error("User not authenticated");
  return `artifacts/${appId}/users/${userId}`;
};

const getPublicPath = () => {
  return `artifacts/${appId}/public_goals`;
};

// --- Listeners ---

export const subscribeToExpenses = (callback: (expenses: Expense[]) => void) => {
  if (!db || !userId) return () => {};
  
  const q = query(collection(db, `${getUserPath()}/expenses`));
  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(doc => doc.data() as Expense);
    callback(data);
  });
};

export const subscribeToRecurring = (callback: (recurring: RecurringExpense[]) => void) => {
  if (!db || !userId) return () => {};

  const q = query(collection(db, `${getUserPath()}/recurring`));
  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(doc => doc.data() as RecurringExpense);
    callback(data);
  });
};

export const subscribeToCategoryLimits = (callback: (limits: CategoryLimit[]) => void) => {
  if (!db || !userId) return () => {};

  const q = query(collection(db, `${getUserPath()}/limits`));
  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(doc => doc.data() as CategoryLimit);
    callback(data);
  });
};

// Public Shared Goal (Simulated as a singleton for this user group context)
export const subscribeToSharedGoal = (callback: (goal: Goal | null) => void) => {
  if (!db) return () => {};
  // We'll just use a fixed ID for the "Community" goal for this demo app instance
  const goalId = 'community_savings_goal';
  const ref = doc(db, getPublicPath(), goalId);
  
  return onSnapshot(ref, (doc) => {
    if (doc.exists()) {
      callback(doc.data() as Goal);
    } else {
      callback(null);
    }
  });
};

// --- Actions ---

export const addExpenseToDb = async (expense: Expense) => {
  if (!db || !userId) return;
  await setDoc(doc(db, `${getUserPath()}/expenses`, expense.id), expense);
};

export const deleteExpenseFromDb = async (id: string) => {
  if (!db || !userId) return;
  await deleteDoc(doc(db, `${getUserPath()}/expenses`, id));
};

export const addRecurringToDb = async (rule: RecurringExpense) => {
  if (!db || !userId) return;
  await setDoc(doc(db, `${getUserPath()}/recurring`, rule.id), rule);
};

export const deleteRecurringFromDb = async (id: string) => {
  if (!db || !userId) return;
  await deleteDoc(doc(db, `${getUserPath()}/recurring`, id));
};

export const saveCategoryLimit = async (category: string, limit: number) => {
  if (!db || !userId) return;
  const ref = doc(db, `${getUserPath()}/limits`, category);
  if (limit > 0) {
    await setDoc(ref, { category, limit });
  } else {
    await deleteDoc(ref);
  }
};

export const updateSharedGoal = async (title: string, targetAmount: number) => {
  if (!db) return;
  const goalId = 'community_savings_goal';
  const goal: Goal = { id: goalId, title, targetAmount };
  await setDoc(doc(db, getPublicPath(), goalId), goal);
};

// Process recurring logic: Add new expenses and update next due date in a batch
export const processRecurringBatch = async (newExpenses: Expense[], updatedRules: RecurringExpense[]) => {
  if (!db || !userId) return;
  
  const batch = writeBatch(db);

  // Add new generated expenses
  newExpenses.forEach(exp => {
    const ref = doc(db, `${getUserPath()}/expenses`, exp.id);
    batch.set(ref, exp);
  });

  // Update the rules with new dates
  updatedRules.forEach(rule => {
    const ref = doc(db, `${getUserPath()}/recurring`, rule.id);
    batch.update(ref, { nextDueDate: rule.nextDueDate });
  });

  await batch.commit();
};