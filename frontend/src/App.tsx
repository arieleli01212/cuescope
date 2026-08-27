import { useCallback, useEffect, useRef, useState } from "react";
import { api, STORAGE_KEY, UnauthorizedError } from "./api";
import { buildUpdatePayload, createLatestRequestGate, currentMonth, settleRefreshes } from "./lib/dashboardHelpers";
import type { Category, Me, Summary, Transaction } from "./types";
import { LoginScreen } from "./components/LoginScreen";
import { TopBar } from "./components/TopBar";
import { Nav, type Tab } from "./components/Nav";
import { Fab } from "./components/Fab";
import { SummaryTab } from "./components/SummaryTab";
import { TransactionsTab } from "./components/TransactionsTab";
import { CategoriesTab } from "./components/CategoriesTab";
import { AddTransactionSheet } from "./components/AddTransactionTab";

const TAB_TITLES: Record<Tab, string> = {
  summary: "תמונת מצב פיננסית",
  list: "העסקאות שלך",
  categories: "ניהול קטגוריות",
  add: "הוספת עסקה",
};

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [whoami, setWhoami] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("summary");
  const [addOpen, setAddOpen] = useState(false);
  const addOpenerRef = useRef<HTMLElement | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const categoryRequestGate = useRef(createLatestRequestGate());

  const [summaryMonth, setSummaryMonth] = useState(currentMonth());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const summaryRequestId = useRef(0);

  const [listMonth, setListMonth] = useState(currentMonth());
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const transactionRequestGate = useRef(createLatestRequestGate());
  const [editingLocked, setEditingLocked] = useState(false);

  const handleUnauthorized = useCallback((message?: string) => {
    setLoggedIn(false);
    setLoginError(message ?? null);
  }, []);

  async function callApi<T>(path: string, options?: RequestInit): Promise<T | null> {
    try {
      return await api<T>(path, options);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        handleUnauthorized("המפתח שגוי או פג תוקף. נסו שוב.");
      }
      throw err;
    }
  }

  const loadCategories = useCallback(async () => {
    const requestToken = categoryRequestGate.current.issue();
    const data = await callApi<Category[]>("/categories");
    const nextCategories = data ?? [];
    if (categoryRequestGate.current.isCurrent(requestToken)) {
      setCategories(nextCategories);
    }
    return nextCategories;
  }, []);

  const loadSummary = useCallback(async (month: string) => {
    const requestId = ++summaryRequestId.current;
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const data = await callApi<Summary>(`/transactions/summary?month=${month}`);
      if (requestId !== summaryRequestId.current) return;
      setSummary(data);
      setSummaryLoading(false);
    } catch (err) {
      if (requestId !== summaryRequestId.current) return;
      setSummaryLoading(false);
      if (!(err instanceof UnauthorizedError)) {
        setSummaryError("שגיאה בטעינת הסיכום: " + (err as Error).message);
      }
    }
  }, []);

  const loadTransactions = useCallback(
    async (month: string) => {
      const requestToken = transactionRequestGate.current.issue();
      const data = await callApi<Transaction[]>(`/transactions?month=${month}`);
      const nextTransactions = data ?? [];
      if (transactionRequestGate.current.isCurrent(requestToken)) {
        setTransactions(nextTransactions);
      }
      return nextTransactions;
    },
    []
  );

  // ---- bootstrap after login ----
  async function tryLogin(key: string) {
    localStorage.setItem(STORAGE_KEY, key);
    try {
      const me = await callApi<Me>("/me");
      if (!me) return;
      setWhoami(`שלום, ${me.name}`);
      setLoggedIn(true);
      setLoginError(null);
      await Promise.all([loadCategories(), loadSummary(summaryMonth)]);
    } catch (err) {
      if (!(err instanceof UnauthorizedError)) {
        setLoginError("שגיאת התחברות: " + (err as Error).message);
      }
    }
  }

  useEffect(() => {
    const key = localStorage.getItem(STORAGE_KEY);
    if (key) tryLogin(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    setLoggedIn(false);
    setLoginError(null);
  }

  function switchTab(next: Tab, opener: HTMLButtonElement) {
    if (next === "add") {
      openAdd(opener);
      return;
    }
    setTab(next);
    if (next === "list") loadTransactions(listMonth);
    if (next === "summary") loadSummary(summaryMonth);
    if (next === "categories") loadCategories();
  }

  function openAdd(opener: HTMLButtonElement) {
    addOpenerRef.current = opener;
    setAddOpen(true);
  }

  // ---- live-ish sync: refresh active tab on visibility / 30s poll ----
  useEffect(() => {
    if (!loggedIn) return;
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      if (tab === "list") loadTransactions(listMonth);
      if (tab === "summary") loadSummary(summaryMonth);
    }
    document.addEventListener("visibilitychange", onVisible);
    const interval = setInterval(onVisible, 30000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(interval);
    };
  }, [loggedIn, tab, listMonth, summaryMonth, loadTransactions, loadSummary]);

  async function handleSummaryMonthChange(month: string) {
    setSummaryMonth(month);
    await loadSummary(month);
  }

  async function handleListMonthChange(month: string) {
    setListMonth(month);
    await loadTransactions(month);
  }

  async function handleSaveTransaction(id: string, payload: ReturnType<typeof buildUpdatePayload>) {
    setEditingLocked(true);
    try {
      await callApi(`/transactions/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
      await loadTransactions(listMonth);
    } finally {
      setEditingLocked(false);
    }
  }

  async function handleDeleteTransaction(id: string) {
    await callApi(`/transactions/${id}`, { method: "DELETE" });
    await loadTransactions(listMonth);
    if (tab === "summary") loadSummary(summaryMonth);
  }

  async function handleAddTransaction(payload: {
    type: "EXPENSE" | "INCOME";
    amount: number;
    currency: string;
    categoryId: string;
    note?: string;
  }) {
    await callApi("/transactions", { method: "POST", body: JSON.stringify(payload) });
    const refreshes: Promise<unknown>[] = [loadSummary(summaryMonth)];
    if (tab === "list") refreshes.push(loadTransactions(listMonth));
    await settleRefreshes(refreshes);
  }

  async function handleCreateCategory(name: string, group?: string): Promise<Category> {
    const category = await callApi<Category>("/categories", {
      method: "POST",
      body: JSON.stringify({ name, group }),
    });
    await loadCategories();
    return category!;
  }

  async function handleUpdateCategoryGroup(id: string, group: string | null) {
    await callApi(`/categories/${id}`, { method: "PATCH", body: JSON.stringify({ group }) });
    await loadCategories();
  }

  async function handleDeleteCategory(id: string) {
    await callApi(`/categories/${id}`, { method: "DELETE" });
    await loadCategories();
  }

  if (!loggedIn) {
    return <LoginScreen onLogin={tryLogin} error={loginError} />;
  }

  return (
    <div className="flex min-h-screen min-w-0 flex-col md:flex-row">
      <Nav active={tab} addOpen={addOpen} onChange={switchTab} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TopBar whoami={whoami} title={TAB_TITLES[tab]} onLogout={logout} />
        <main className="mx-auto w-full max-w-[1280px] min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-7 lg:px-8 lg:py-8 max-md:pb-[calc(7rem+env(safe-area-inset-bottom))]">
          {tab === "summary" && (
            <SummaryTab
              month={summaryMonth}
              onMonthChange={handleSummaryMonthChange}
              loading={summaryLoading}
              error={summaryError}
              summary={summary}
            />
          )}
          {tab === "list" && (
            <TransactionsTab
              month={listMonth}
              onMonthChange={handleListMonthChange}
              transactions={transactions}
              categories={categories}
              locked={editingLocked}
              onSave={handleSaveTransaction}
              onDelete={handleDeleteTransaction}
            />
          )}
          {tab === "categories" && (
            <CategoriesTab
              categories={categories}
              onUpdateGroup={handleUpdateCategoryGroup}
              onDelete={handleDeleteCategory}
              onCreate={handleCreateCategory}
            />
          )}
        </main>
      </div>
      <Fab onClick={openAdd} />
      <AddTransactionSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        returnFocusRef={addOpenerRef}
        categories={categories}
        onSubmit={handleAddTransaction}
        onCreateCategory={handleCreateCategory}
      />
    </div>
  );
}
