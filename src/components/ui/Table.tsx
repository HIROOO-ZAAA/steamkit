"use client";

import React, { useState, useMemo } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import styles from "./Table.module.css";

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T, index: number) => React.ReactNode;
  sortable?: boolean;
  align?: "left" | "center" | "right";
  width?: string;
  className?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T, index: number) => string;
  emptyMessage?: string;
  striped?: boolean;
  hoverable?: boolean;
  sortable?: boolean;
  defaultSortKey?: string;
  defaultSortDirection?: "asc" | "desc";
  onSort?: (key: string, direction: "asc" | "desc") => void;
  rowClassName?: (row: T, index: number) => string;
  className?: string;
}

export function Table<T>({
  columns,
  data,
  keyExtractor,
  emptyMessage = "No data",
  striped = true,
  hoverable = true,
  sortable = false,
  defaultSortKey,
  defaultSortDirection = "asc",
  onSort,
  rowClassName,
  className = "",
}: TableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(defaultSortKey ?? null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">(defaultSortDirection);

  const sortedData = useMemo(() => {
    if (!sortKey || !sortable) return data;

    return [...data].sort((a, b) => {
      const column = columns.find((c) => c.key === sortKey);
      if (!column || !column.sortable) return 0;

      const aVal = a[sortKey as keyof T];
      const bVal = b[sortKey as keyof T];

      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      const comparison = aVal < bVal ? -1 : 1;
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [data, sortKey, sortDirection, sortable, columns]);

  const handleSort = (key: string) => {
    const column = columns.find((c) => c.key === key);
    if (!column?.sortable) return;

    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
    onSort?.(key, sortKey === key && sortDirection === "asc" ? "desc" : "asc");
  };

  const SortIcon = ({ direction }: { direction: "asc" | "desc" | "none" }) => {
    if (direction === "asc") return <ChevronUp size={14} aria-hidden="true" />;
    if (direction === "desc") return <ChevronDown size={14} aria-hidden="true" />;
    return <ChevronsUpDown size={14} aria-hidden="true" />;
  };

  return (
    <div className={`${styles.tableWrapper} ${className}`}>
      <div className={styles.tableContainer} role="region" aria-label="Data table" tabIndex={0}>
        <table className={styles.table}>
          <thead>
            <tr className={styles.headerRow}>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`${styles.headerCell} ${column.align === "center" ? styles.alignCenter : column.align === "right" ? styles.alignRight : ""} ${column.className || ""}`}
                  style={{ width: column.width }}
                  scope="col"
                  aria-sort={column.sortable && sortable ? (sortKey === column.key ? (sortDirection === "asc" ? "ascending" : "descending") : "none") : undefined}
                >
                  {column.sortable && sortable ? (
                    <button
                      type="button"
                      className={styles.sortButton}
                      onClick={() => handleSort(column.key)}
                    >
                      <span className={styles.headerContent}>
                        {column.header}
                        <SortIcon direction={sortKey === column.key ? sortDirection : "none"} />
                      </span>
                    </button>
                  ) : (
                    <span className={styles.headerContent}>{column.header}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedData.length > 0 ? (
              sortedData.map((row, rowIndex) => (
                <tr
                  key={keyExtractor(row, rowIndex)}
                  className={`${styles.bodyRow} ${striped && rowIndex % 2 === 1 ? styles.striped : ""} ${hoverable ? styles.hoverable : ""} ${rowClassName?.(row, rowIndex) || ""}`}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`${styles.bodyCell} ${column.align === "center" ? styles.alignCenter : column.align === "right" ? styles.alignRight : ""} ${column.className || ""}`}
                    >
                      {column.render
                        ? column.render(row, rowIndex)
                        : String(row[column.key as keyof T] ?? "")}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className={styles.emptyCell}>
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Convenience: simple table with just data and columns inferred from first row
export function SimpleTable<T extends Record<string, unknown>>({
  data,
  columns: customColumns,
  ...props
}: Omit<TableProps<T>, "columns" | "keyExtractor"> & {
  columns?: (keyof T)[];
  keyExtractor?: (row: T) => string;
}) {
  const keyExtractor = props.keyExtractor ?? ((row) => String(row.id ?? row.key ?? JSON.stringify(row)));
  const columns = customColumns ?? (data[0] ? (Object.keys(data[0]) as (keyof T)[]) : []);

  return (
    <Table<T>
      data={data}
      columns={columns.map((key) => ({
        key: String(key),
        header: String(key).replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()),
        render: (row) => String(row[key] ?? ""),
        sortable: true,
      }))}
      keyExtractor={keyExtractor}
      {...props}
    />
  );
}