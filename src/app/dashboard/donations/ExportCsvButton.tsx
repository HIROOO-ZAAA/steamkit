"use client";

import { Download } from "lucide-react";

type TipRow = {
  id: string;
  donor_name?: string | null;
  tipper_name?: string | null;
  amount: number;
  currency?: string | null;
  payment_method?: string | null;
  provider?: string | null;
  created_at: string;
  message?: string | null;
};

export default function ExportCsvButton({
  rows,
  className,
}: {
  rows: TipRow[];
  className?: string;
}) {
  const exportToCSV = () => {
    const headers = ["ID", "Tipper Name", "Amount", "Currency", "Payment Method", "Date", "Message"];
    const csvRows = rows.map((t) => [
      t.id,
      `"${t.tipper_name ?? t.donor_name ?? "Anonymous"}"`,
      t.amount,
      t.currency ?? "USD",
      `"${t.payment_method ?? t.provider ?? "ABA PAY"}"`,
      new Date(t.created_at).toISOString(),
      `"${(t.message ?? "").replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...csvRows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `StreamKit_Donations_${new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <button type="button" onClick={exportToCSV} className={className}>
      <Download size={14} /> Export CSV
    </button>
  );
}
