import React, { useState, useEffect } from "react";
import { db, Score } from "@/lib/db";
import * as XLSX from "xlsx";

interface TableViewProps {
  matchId: number;
  judges: string[];
  contestants: string[];
  scores: Score[];
  onUpdate: () => void;
  children?: React.ReactNode;
}

export default function TableView({
  matchId,
  judges,
  contestants,
  scores,
  onUpdate,
  children,
}: TableViewProps) {
  const [editingCell, setEditingCell] = useState<{
    contestant: string;
    judge: string;
  } | null>(null);
  const [editValue, setEditValue] = useState("");

  // Create a map for quick score lookup
  const scoreMap = new Map<string, number | null>();
  scores.forEach((score) => {
    const key = `${score.contestant}|${score.judge}`;
    scoreMap.set(key, score.value);
  });

  const getScore = (contestant: string, judge: string): number | null => {
    return scoreMap.get(`${contestant}|${judge}`) ?? null;
  };

  const handleCellDoubleClick = (contestant: string, judge: string) => {
    setEditingCell({ contestant, judge });
    const currentValue = getScore(contestant, judge);
    setEditValue(currentValue !== null ? currentValue.toString() : "");
  };

  const handleCellBlur = async () => {
    if (!editingCell) return;

    const numValue = editValue.trim() === "" ? null : parseFloat(editValue);

    if (
      numValue !== null &&
      (isNaN(numValue) || numValue < 0 || numValue > 100)
    ) {
      alert("请输入有效的分数 (0-100)");
      setEditingCell(null);
      return;
    }

    // Update score in database
    const existingScore = scores.find(
      (s) =>
        s.contestant === editingCell.contestant && s.judge === editingCell.judge
    );

    const now = Date.now();
    if (existingScore) {
      await db.scores.update(existingScore.id!, {
        value: numValue,
        updatedAt: now,
      });
    } else {
      await db.scores.add({
        matchId,
        contestant: editingCell.contestant,
        judge: editingCell.judge,
        value: numValue,
        updatedAt: now,
      });
    }

    await db.matches.update(matchId, { updatedAt: now });
    setEditingCell(null);
    onUpdate();
  };

  const handleCellKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleCellBlur();
    } else if (e.key === "Escape") {
      setEditingCell(null);
    }
  };

  const calculateTotal = (contestant: string): number => {
    let sum = 0;
    let count = 0;
    judges.forEach((judge) => {
      const score = getScore(contestant, judge);
      if (score !== null) {
        sum += score;
        count++;
      }
    });
    return count > 0 ? sum : 0;
  };

  const calculateAverage = (contestant: string): number => {
    const total = calculateTotal(contestant);
    const count = judges.filter(
      (judge) => getScore(contestant, judge) !== null
    ).length;
    return count > 0 ? total / count : 0;
  };

  const handleExportExcel = () => {
    // Prepare data for Excel
    const data: any[][] = [];

    // Header row
    const headerRow = ["选手", ...judges, "总分", "平均分"];
    data.push(headerRow);

    // Data rows
    contestants.forEach((contestant) => {
      const row = [contestant];
      judges.forEach((judge) => {
        const score = getScore(contestant, judge);
        row.push(score !== null ? score + "" : "");
      });
      row.push(calculateTotal(contestant).toFixed(2));
      row.push(calculateAverage(contestant).toFixed(2));
      data.push(row);
    });

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "评分表");

    // Export
    XLSX.writeFile(wb, `比赛评分表_${Date.now()}.xlsx`);
  };

  if (judges.length === 0 && contestants.length === 0) {
    return (
      <div className="card">
        <p style={{ textAlign: "center", color: "#666" }}>
          还没有添加裁判和选手，请先添加裁判和选手
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex-between mb-3">
        <h2 style={{ margin: 0, color: "var(--dark)" }}>评分表</h2>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          {children}
          <button className="btn btn-special" onClick={handleExportExcel}>
            📊 导出 Excel
          </button>
        </div>
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>选手</th>
              {judges.map((judge) => (
                <th key={judge}>{judge}</th>
              ))}
              <th>总分</th>
              <th>平均分</th>
            </tr>
          </thead>
          <tbody>
            {contestants.map((contestant) => (
              <tr key={contestant}>
                <td style={{ fontWeight: 600 }}>{contestant}</td>
                {judges.map((judge) => {
                  const isEditing =
                    editingCell?.contestant === contestant &&
                    editingCell?.judge === judge;
                  const score = getScore(contestant, judge);
                  const isEmpty = score === null;

                  return (
                    <td
                      key={judge}
                      className={`editable ${isEmpty ? "empty" : ""}`}
                      onDoubleClick={() =>
                        handleCellDoubleClick(contestant, judge)
                      }
                    >
                      {isEditing ? (
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={handleCellBlur}
                          onKeyDown={handleCellKeyDown}
                          autoFocus
                          style={{
                            width: "100%",
                            padding: "4px",
                            border: "2px solid #000",
                            borderRadius: "4px",
                          }}
                        />
                      ) : score !== null ? (
                        score.toFixed(2)
                      ) : (
                        "-"
                      )}
                    </td>
                  );
                })}
                <td style={{ fontWeight: 600 }}>
                  {calculateTotal(contestant).toFixed(2)}
                </td>
                <td style={{ fontWeight: 600 }}>
                  {calculateAverage(contestant).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {contestants.length === 0 && (
        <p style={{ textAlign: "center", color: "#666", marginTop: "16px" }}>
          还没有添加选手
        </p>
      )}
    </div>
  );
}
