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

// ---------- Generate month-by-month breakdown for a given period (using a fixed principal) ----------
interface MonthEntry {
  year: number;
  monthName: string;
  startDate: Date;
  endDate: Date;
  isFullMonth: boolean;
  days: number; // for partial months
  interest: number;
}

function generateMonthEntriesForPeriod(
  principal: number,
  monthlyRate: number,
  periodStart: Date,
  periodEnd: Date
): MonthEntry[] {
  const entries: MonthEntry[] = [];
  let current = new Date(periodStart);
  const endDate = new Date(periodEnd);

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
  let currentDate = new Date(start);

  breakdownLines.push({ level: 0, description: "Base amount", amount: currentPrincipal });

  // We'll also collect year totals for the final summary line
  const yearTotals: { year: number; total: number }[] = [];

  while (currentDate < end) {
    // Determine the end of the current year (Dec 31) or the final date if earlier
    const yearEnd = new Date(currentDate.getFullYear(), 11, 31);
    const periodEnd = yearEnd < end ? yearEnd : end;

    // Generate month entries for this period using the current principal
    const monthEntries = generateMonthEntriesForPeriod(
      currentPrincipal,
      monthlyRate,
      currentDate,
      periodEnd
    );

    if (monthEntries.length === 0) break;

    // Header for this period
    const isLastPeriod = periodEnd.getTime() === end.getTime();
    const headerDesc = isLastPeriod
      ? `Final period (${currentDate.toLocaleDateString()} – ${periodEnd.toLocaleDateString()})`
      : `Year ${currentDate.getFullYear()} (${currentDate.toLocaleDateString()} – ${periodEnd.toLocaleDateString()})`;
    breakdownLines.push({ level: 1, description: headerDesc });

    // Add month lines and calculate total interest for this period
    let periodInterest = 0;
    for (const month of monthEntries) {
      const dateRange = `${month.startDate.toLocaleDateString()} – ${month.endDate.toLocaleDateString()}`;
      const desc = month.isFullMonth
        ? `  ${month.monthName} (${dateRange}) full month`
        : `  ${month.monthName} (${dateRange}) partial (${month.days} days)`;
      breakdownLines.push({ level: 2, description: desc, amount: month.interest });
      periodInterest += month.interest;
    }

    // Total interest for this period
    breakdownLines.push({
      level: 3,
      description: isLastPeriod ? `  Total interest for final period` : `  Total interest for year ${currentDate.getFullYear()}`,
      amount: periodInterest,
    });

    // If this is not the last period (i.e., we ended on Dec 31 and loan continues), compound
    if (!isLastPeriod) {
      // Store year total
      yearTotals.push({ year: currentDate.getFullYear(), total: periodInterest });

      currentPrincipal += periodInterest;
      breakdownLines.push({
        level: 3,
        description: `  Principal after compounding on ${periodEnd.toLocaleDateString()}`,
        amount: currentPrincipal,
      });
      // Move to next year's January 1
      currentDate = new Date(periodEnd.getFullYear() + 1, 0, 1);
    } else {
      // Final period: add interest to get final total
      currentPrincipal += periodInterest;
      break;
    }
  }

  // Add a concise year-wise sum line before the final total
  if (yearTotals.length > 0) {
    const yearSumDesc = yearTotals.map(yt => `${yt.year}: ${formatINR(yt.total)}`).join('; ');
    breakdownLines.push({
      level: 3,
      description: `Year-wise interest totals: ${yearSumDesc}`,
    });
  }

  breakdownLines.push({ level: 0, description: "Total amount due", amount: currentPrincipal });
  return { breakdown: breakdownLines, finalTotal: currentPrincipal };
}

// ---------- Helper to extract year-wise summary from breakdown lines (for the top box) ----------
interface YearSummary {
  label: string;
  interest: number;
  principalAfter?: number; // only for full years (not final period)
}

function getYearSummaries(lines: { level: number; description: string; amount?: number }[]): {
  summaries: YearSummary[];
  finalTotal?: number;
} {
  const summaries: YearSummary[] = [];
  let current: YearSummary | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.level === 1) {
      // year or final period header
      if (current) summaries.push(current);
      current = { label: line.description, interest: 0 };
    } else if (line.level === 3 && current) {
      if (line.description.includes('Total interest')) {
        current.interest = line.amount ?? 0;
      } else if (line.description.includes('Principal after compounding')) {
        current.principalAfter = line.amount;
      }
    }
  }
  if (current) summaries.push(current);

  const finalTotalLine = lines.find(l => l.description === 'Total amount due');
  return { summaries, finalTotal: finalTotalLine?.amount };
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

  // Extract year summaries for display
  const { summaries, finalTotal } = getYearSummaries(breakdown);

  return (
    <>
      {/* Print styles */}
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

            {/* Year-wise summary at a glance (optional, but kept) */}
            {summaries.length > 0 && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
                <h3 className="font-semibold text-blue-800 mb-2">At a Glance</h3>
                <ul className="space-y-1 text-sm">
                  <li><span className="font-medium">Base amount:</span> {formatINR(principal)}</li>
                  {summaries.map((sum, idx) => (
                    <li key={idx}>
                      <span className="font-medium">{sum.label}:</span> Interest {formatINR(sum.interest)}
                      {sum.principalAfter !== undefined && (
                        <> → Principal after compounding {formatINR(sum.principalAfter)}</>
                      )}
                    </li>
                  ))}
                  {finalTotal !== undefined && (
                    <li className="font-bold text-green-800">
                      Total amount due: {formatINR(finalTotal)}
                    </li>
                  )}
                </ul>
              </div>
            )}

            {/* Detailed month-by-month breakdown */}
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