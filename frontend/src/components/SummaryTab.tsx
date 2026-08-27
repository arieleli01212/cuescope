import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  type ChartOptions,
} from "chart.js";
import { ArrowDownLeft, ArrowUpRight, CircleAlert, WalletCards } from "lucide-react";
import { Bar, Doughnut } from "react-chartjs-2";

import { buildChartAriaLabel, hasChartData } from "../lib/dashboardHelpers";
import type { Summary } from "../types";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Skeleton } from "./ui/skeleton";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

const CHART_COLORS = [
  "#38bdf8",
  "#f59e0b",
  "#2dd4a7",
  "#a78bfa",
  "#f472b6",
  "#60a5fa",
  "#c084fc",
  "#fb7185",
];

const currencyFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatIls(value: number | string) {
  const amount = Number(value);
  const parts = currencyFormatter.formatToParts(Math.abs(amount));
  const symbol = parts.find((part) => part.type === "currency")?.value ?? "₪";
  const digits = parts
    .filter((part) =>
      ["integer", "group", "decimal", "fraction"].includes(part.type),
    )
    .map((part) => part.value)
    .join("");

  return `${amount < 0 ? "−" : ""}${symbol}${digits}`;
}

interface SummaryTabProps {
  month: string;
  onMonthChange: (month: string) => void;
  loading: boolean;
  error: string | null;
  summary: Summary | null;
}

interface ChartCardProps {
  title: string;
  description: string;
  labels: string[];
  data: number[];
  type: "bar" | "doughnut";
  colors?: string[];
  emptyText: string;
  className?: string;
}

const tooltipOptions = {
  backgroundColor: "#111b2e",
  titleColor: "#f7fbff",
  bodyColor: "#f7fbff",
  borderColor: "rgba(148, 163, 184, 0.24)",
  borderWidth: 1,
  padding: 12,
  displayColors: true,
};

function ChartCard({
  title,
  description,
  labels,
  data,
  type,
  colors,
  emptyText,
  className = "",
}: ChartCardProps) {
  const hasData = hasChartData(data);
  const palette = colors ?? labels.map((_, index) => CHART_COLORS[index % CHART_COLORS.length]);
  const dataset = {
    labels,
    datasets: [
      {
        data,
        backgroundColor: palette,
        borderColor: type === "doughnut" ? "#0c1322" : palette,
        borderWidth: type === "doughnut" ? 3 : 0,
        borderRadius: type === "bar" ? 10 : 0,
        maxBarThickness: 58,
        hoverOffset: type === "doughnut" ? 5 : 0,
      },
    ],
  };
  const basePlugins = {
    legend: {
      display: type === "doughnut",
      position: "bottom" as const,
      labels: {
        color: "#95a3b8",
        usePointStyle: true,
        pointStyle: "circle" as const,
        padding: 18,
        boxWidth: 8,
      },
    },
    tooltip: tooltipOptions,
  };
  const barOptions: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: basePlugins,
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { color: "#95a3b8" },
      },
      y: {
        beginAtZero: true,
        grid: { color: "rgba(148, 163, 184, 0.1)" },
        border: { display: false },
        ticks: { color: "#95a3b8" },
      },
    },
  };
  const doughnutOptions: ChartOptions<"doughnut"> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "68%",
    animation: false,
    plugins: basePlugins,
  };

  return (
    <Card className={`premium-card min-w-0 overflow-hidden ${className}`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className="relative h-[280px] min-w-0 sm:h-[320px] lg:h-[340px]"
          {...(hasData ? { role: "img", "aria-label": buildChartAriaLabel(labels, data) } : {})}
        >
          {hasData ? (
            type === "bar" ? (
              <Bar data={dataset} options={barOptions} />
            ) : (
              <Doughnut data={dataset} options={doughnutOptions} />
            )
          ) : (
            <p className="m-0 flex h-full items-center justify-center px-4 text-center text-sm text-muted">
              {emptyText}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function KpiSkeleton({ label }: { label: string }) {
  return (
    <Card
      className="premium-card min-w-0"
      role="status"
      aria-label={`טוען נתון ${label}`}
      aria-live="polite"
    >
      <CardHeader className="pb-3">
        <Skeleton className="h-4 w-20" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-9 w-36 max-w-full" />
        <Skeleton className="mt-4 h-3 w-24 max-w-full" />
      </CardContent>
    </Card>
  );
}

function KpiCard({
  id,
  label,
  amount,
  hint,
  icon,
  dominant = false,
  critical = false,
}: {
  id: string;
  label: string;
  amount: number | string;
  hint: string;
  icon: React.ReactNode;
  dominant?: boolean;
  critical?: boolean;
}) {
  return (
    <Card
      className={`min-w-0 overflow-hidden ${
        dominant
          ? "border-primary/25 bg-gradient-to-bl from-primary/15 via-surface to-surface shadow-glow"
          : "premium-card"
      }`}
      role="group"
      aria-labelledby={id}
    >
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardDescription id={id} className="font-medium text-muted">
          {label}
        </CardDescription>
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-full ${
            critical
              ? "bg-critical/15 text-critical"
              : dominant
                ? "bg-primary/15 text-primary"
                : "bg-cyan/10 text-cyan"
          }`}
          aria-hidden="true"
        >
          {icon}
        </span>
      </CardHeader>
      <CardContent>
        <p
          className={`m-0 overflow-hidden text-ellipsis whitespace-nowrap text-[clamp(1.7rem,4vw,2.35rem)] font-bold tracking-tight ${
            critical ? "text-critical" : "text-text"
          }`}
          dir="ltr"
        >
          {formatIls(amount)}
        </p>
        <p className="mb-0 mt-3 text-xs text-muted">{hint}</p>
      </CardContent>
    </Card>
  );
}

export function SummaryTab({
  month,
  onMonthChange,
  loading,
  error,
  summary,
}: SummaryTabProps) {
  const balance = Number(summary?.balance ?? 0);
  const categoryEntries = summary?.byCategory.filter((category) => Number(category.expense) > 0) ?? [];
  const groupEntries = summary?.byGroup.filter((group) => Number(group.expense) > 0) ?? [];

  return (
    <section className="min-w-0 space-y-5" aria-labelledby="summary-title">
      <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-primary">
            סיכום פיננסי
          </p>
          <h1
            id="summary-title"
            className="m-0 text-3xl font-bold tracking-tight text-text sm:text-4xl"
          >
            תמונת מצב חודשית
          </h1>
          <p className="mb-0 mt-2 max-w-xl text-sm leading-6 text-muted">
            כל המספרים החשובים, במבט אחד ברור ועדכני.
          </p>
        </div>

        <div className="w-full min-w-0 sm:w-52">
          <Label htmlFor="summary-month" className="text-muted">
            חודש להצגה
          </Label>
          <Input
            id="summary-month"
            type="month"
            value={month}
            onChange={(event) => onMonthChange(event.target.value)}
            className="mt-2 min-w-0 bg-surface-raised"
          />
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <CircleAlert className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>לא הצלחנו לטעון את הסיכום</AlertTitle>
          <AlertDescription className="text-text/80">{error}</AlertDescription>
        </Alert>
      )}

      {loading && !error && (
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          <KpiSkeleton label="מאזן" />
          <KpiSkeleton label="הכנסות" />
          <KpiSkeleton label="הוצאות" />
        </div>
      )}

      {!loading && !error && summary && (
        <>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard
              id="balance-kpi"
              label={balance < 0 ? "מאזן — גרעון" : "מאזן"}
              amount={summary.balance}
              hint={balance < 0 ? "ההוצאות גבוהות מההכנסות" : "היתרה החודשית שלך"}
              icon={<WalletCards className="h-5 w-5" />}
              dominant
              critical={balance < 0}
            />
            <KpiCard
              id="income-kpi"
              label="הכנסות"
              amount={summary.totalIncome}
              hint="סך ההכנסות בחודש"
              icon={<ArrowDownLeft className="h-5 w-5" />}
            />
            <KpiCard
              id="expense-kpi"
              label="הוצאות"
              amount={summary.totalExpense}
              hint="סך ההוצאות בחודש"
              icon={<ArrowUpRight className="h-5 w-5" />}
            />
          </div>

          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <ChartCard
              title="הכנסות מול הוצאות"
              description="השוואת תזרים הכספים בחודש הנבחר"
              labels={["הכנסות", "הוצאות"]}
              data={[Number(summary.totalIncome), Number(summary.totalExpense)]}
              type="bar"
              colors={["#2dd4a7", "#60a5fa"]}
              emptyText="אין עדיין תנועות בחודש הזה. הוספת עסקה תציג כאן את ההשוואה."
            />
            <ChartCard
              title="הוצאות לפי קטגוריה"
              description="החלוקה שמראה לאן הכסף הולך"
              labels={categoryEntries.map((category) => category.name)}
              data={categoryEntries.map((category) => Number(category.expense))}
              type="doughnut"
              emptyText="אין הוצאות בחודש הזה. אחרי הוספת הוצאה תופיע כאן החלוקה."
            />
            <ChartCard
              title="הוצאות לפי נושא"
              description="מבט רחב על קבוצות ההוצאה המרכזיות"
              labels={groupEntries.map((group) => group.name)}
              data={groupEntries.map((group) => Number(group.expense))}
              type="doughnut"
              emptyText="אין עדיין הוצאות מקובצות לפי נושא בחודש הזה."
              className="lg:col-span-2"
            />
          </div>
        </>
      )}

      {!loading && !error && !summary && (
        <Card className="premium-card">
          <CardContent className="flex min-h-40 items-center justify-center p-6 text-center text-sm text-muted">
            אין עדיין סיכום לחודש הזה. בחרו חודש אחר או הוסיפו עסקה חדשה.
          </CardContent>
        </Card>
      )}
    </section>
  );
}
