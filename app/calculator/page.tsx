"use client";

import { useState } from "react";

// ---------- Helper functions ----------
const formatINR = (amount: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(amount);

const getMonthName = (date: Date): string =>
  date.toLocaleString("default", { month: "long" });

function getDaysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

// Day counting: exclude start day, include end day
function daysInPartialPeriod(start: Date, end: Date): number {
  return end.getDate() - start.getDate();
}

// ---------- Generate month-by-month breakdown ----------
interface MonthEntry {
  year: number;
  monthName: string;
  startDate: Date;
  endDate: Date;
  isFullMonth: boolean;
  days: number; // for partial months
  interest: number;
}

function generateMonthEntries(
  principal: number,
  monthlyRate: number,
  start: Date,
  end: Date
): MonthEntry[] {
  const entries: MonthEntry[] = [];
  let current = new Date(start);
  const endDate = new Date(end);

  while (current < endDate) {
    const year = current.getFullYear();
    const month = current.getMonth();
    const monthName = getMonthName(current);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const monthEnd = lastDayOfMonth < endDate ? lastDayOfMonth : endDate;

    let isFullMonth = false;
    let days = 0;
    let interest = 0;

    // Check if this month is a full month (from 1st to last day)
    if (current.getDate() === 1 && monthEnd.getDate() === lastDayOfMonth.getDate()) {
      isFullMonth = true;
      interest = principal * monthlyRate;
    } else {
      // Partial month
      if (current.getDate() === 1) {
        // Starting on 1st but ending before last day (end month)
        days = daysInPartialPeriod(current, monthEnd);
      } else if (monthEnd.getDate() === lastDayOfMonth.getDate()) {
        // Starting after 1st but ending on last day (start month)
        days = daysInPartialPeriod(current, monthEnd);
      } else {
        // Both start and end within the same month (shouldn't happen because we break early)
        days = daysInPartialPeriod(current, monthEnd);
      }
      interest = principal * monthlyRate * (days / 30);
    }

    entries.push({
      year,
      monthName,
      startDate: new Date(current),
      endDate: new Date(monthEnd),
      isFullMonth,
      days,
      interest,
    });

    // Move to next month
    current = new Date(year, month + 1, 1);
    if (current > endDate) break;
  }

  return entries;
}

// ---------- Main calculator with yearly compounding ----------
function computeDetailedBreakdown(
  principal: number,
  ratePercent: number,
  startStr: string,
  endStr: string
) {
  const start = new Date(startStr);
  const end = new Date(endStr);
  const breakdownLines: { level: number; description: string; amount?: number }[] = [];

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
    return { breakdown: breakdownLines, finalTotal: 0 };
  }

  const monthlyRate = ratePercent / 100;
  let currentPrincipal = principal;

  breakdownLines.push({ level: 0, description: "Base amount", amount: currentPrincipal });

  // Generate all month entries
  const allMonths = generateMonthEntries(currentPrincipal, monthlyRate, start, end);

  // Group by year
  const years = new Map<number, MonthEntry[]>();
  for (const month of allMonths) {
    if (!years.has(month.year)) years.set(month.year, []);
    years.get(month.year)!.push(month);
  }

  // Process each year in order
  const sortedYears = Array.from(years.keys()).sort((a, b) => a - b);
  for (let i = 0; i < sortedYears.length; i++) {
    const year = sortedYears[i];
    const yearMonths = years.get(year)!;
    const isLastYear = i === sortedYears.length - 1;

    // Year header
    const firstMonth = yearMonths[0];
    const lastMonth = yearMonths[yearMonths.length - 1];
    const headerDesc = isLastYear
      ? `Final period (${firstMonth.startDate.toLocaleDateString()} – ${lastMonth.endDate.toLocaleDateString()})`
      : `Year ${year} (${firstMonth.startDate.toLocaleDateString()} – ${lastMonth.endDate.toLocaleDateString()})`;
    breakdownLines.push({ level: 1, description: headerDesc });

    // Month lines
    let yearInterest = 0;
    for (const month of yearMonths) {
      const dateRange = `${month.startDate.toLocaleDateString()} – ${month.endDate.toLocaleDateString()}`;
      const desc = month.isFullMonth
        ? `  ${month.monthName} (${dateRange}) full month`
        : `  ${month.monthName} (${dateRange}) partial (${month.days} days)`;
      breakdownLines.push({ level: 2, description: desc, amount: month.interest });
      yearInterest += month.interest;
    }

    // Total interest for the year
    breakdownLines.push({
      level: 3,
      description: isLastYear ? `  Total interest for final period` : `  Total interest for year ${year}`,
      amount: yearInterest,
    });

    // Compound at year end if not last year
    if (!isLastYear) {
      currentPrincipal += yearInterest;
      breakdownLines.push({
        level: 3,
        description: `  Principal after compounding on ${lastMonth.endDate.toLocaleDateString()}`,
        amount: currentPrincipal,
      });
    } else {
      // Final total
      currentPrincipal += yearInterest;
    }
  }

  breakdownLines.push({ level: 0, description: "Total amount due", amount: currentPrincipal });
  return { breakdown: breakdownLines, finalTotal: currentPrincipal };
}

// ---------- React component ----------
export default function CalculatorPage() {
  const [principal, setPrincipal] = useState<number>(10000);
  const [rate, setRate] = useState<number>(4);
  const [startDate, setStartDate] = useState<string>("2023-02-20");
  const [endDate, setEndDate] = useState<string>("2024-12-10");
  const [breakdown, setBreakdown] = useState<{ level: number; description: string; amount?: number }[]>([]);

  const handleCalculate = () => {
    if (!principal || !rate || !startDate || !endDate) return;
    const { breakdown } = computeDetailedBreakdown(principal, rate, startDate, endDate);
    setBreakdown(breakdown);
  };

  const getLineClass = (level: number) => {
    switch (level) {
      case 0: return "font-bold text-lg mt-2";
      case 1: return "font-semibold text-blue-800 mt-3";
      case 2: return "pl-4 text-gray-700";
      case 3: return "pl-4 font-medium text-green-800";
      default: return "";
    }
  };

  return (
    <>
      {/* Print styles – using a regular style tag (no jsx) */}
      <style dangerouslySetInnerHTML={{
        __html: `
          @media print {
            body * {
              visibility: hidden;
            }
            #printable-area, #printable-area * {
              visibility: visible;
            }
            #printable-area {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              padding: 1.5rem;
            }
            .no-print {
              display: none !important;
            }
          }
        `
      }} />

      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">Traditional Interest Calculator (Calendar Year Compounding)</h1>
        <p className="mb-4 text-gray-600">
          Interest is calculated per calendar month. Full months = one month’s interest. Partial months use actual days / 30, with days counted as:<br/>
          • Start month: days = (days in month − start day)  (you pay from the day after borrowing to month end)<br/>
          • End month: days = end day  (you pay from 1st to settlement day)<br/>
          • Same month: days = end day − start day<br/>
          Interest is added to principal (compounded) at the end of each calendar year (Dec 31).<br/>
          <span className="font-semibold">Every month from start to end is listed – December is always included.</span>
        </p>

        {/* Input form – hidden when printing */}
        <div className="no-print bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4">
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="principal">
              Principal Amount (₹)
            </label>
            <input
              id="principal"
              type="number"
              step="0.01"
              min="0"
              value={principal}
              onChange={(e) => setPrincipal(parseFloat(e.target.value) || 0)}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="rate">
              Monthly Interest Rate (%)
            </label>
            <input
              id="rate"
              type="number"
              step="0.01"
              min="0"
              value={rate}
              onChange={(e) => setRate(parseFloat(e.target.value) || 0)}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="startDate">
              Borrowing Date
            </label>
            <input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              required
            />
          </div>

          <div className="mb-6">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="endDate">
              Settlement Date
            </label>
            <input
              id="endDate"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              required
            />
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={handleCalculate}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
            >
              Calculate
            </button>
            <button
              onClick={() => window.print()}
              className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline ml-2 no-print"
            >
              Print / Save as PDF
            </button>
          </div>
        </div>

        {/* Printable area – only this is visible when printing */}
        {breakdown.length > 0 && (
          <div id="printable-area" className="bg-green-50 border border-green-200 rounded p-4 mt-4">
            <h2 className="text-xl font-semibold mb-2">Detailed Breakdown</h2>
            <ul className="space-y-1 font-mono text-sm">
              {breakdown.map((item, index) => (
                <li key={index} className={getLineClass(item.level)}>
                  {item.description}
                  {item.amount !== undefined && `: ${formatINR(item.amount)}`}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}