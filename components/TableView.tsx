import React, { useState, useMemo } from "react";
import { db, Score } from "@/lib/db";
import { applyActions } from "@/lib/actions";
import * as XLSX from "xlsx";

interface TableViewProps {
  matchId: number;
  judges: string[];
  contestants: string[];
  scores: Score[];
  contestantNumbers?: Record<string, string>;
  onUpdate: () => void;
  children?: React.ReactNode;
}

interface EditingRow {
  contestant: string;
  number: string;
  scores: Record<string, string>; // Map judge name to score string
  isNew: boolean;
  originalName?: string; // For edit mode, keep track of original name
}

export default function TableView({
  matchId,
  judges,
  contestants,
  scores,
  contestantNumbers = {},
  onUpdate,
  children,
}: TableViewProps) {
  const [editingCell, setEditingCell] = useState<{
    contestant: string;
    judge: string;
  } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editingRow, setEditingRow] = useState<EditingRow | null>(null);
  const [editingNumber, setEditingNumber] = useState<string | null>(null);
  const [editNumberValue, setEditNumberValue] = useState("");
  const [sortColumn, setSortColumn] = useState<string | null>(null); // 'number' | 'total' | 'average'
  const [sortDirection, setSortDirection] = useState<"asc" | "desc" | null>(
    null
  );

  // Create a map for quick score lookup
  const scoreMap = useMemo(() => {
    const map = new Map<string, number | null>();
    scores.forEach((score) => {
      const key = `${score.contestant}|${score.judge}`;
      map.set(key, score.value);
    });
    return map;
  }, [scores]);

  // Generate unique keys for contestants
  const contestantKeys = useMemo(() => {
    return contestants.map((name, index) => {
      const random = Math.random().toString(36).substring(2, 9);
      return `${index}_${name}_${random}`;
    });
  }, [contestants]);

  // Sort contestants based on sortColumn and sortDirection
  const sortedContestants = useMemo(() => {
    if (!sortColumn || !sortDirection) {
      return contestants;
    }

    // Helper functions for sorting
    const getScoreForSort = (
      contestant: string,
      judge: string
    ): number | null => {
      return scoreMap.get(`${contestant}|${judge}`) ?? null;
    };

    const calcTotalForSort = (contestant: string): number => {
      let sum = 0;
      let count = 0;
      judges.forEach((judge) => {
        const score = getScoreForSort(contestant, judge);
        if (score !== null) {
          sum += score;
          count++;
        }
      });
      return count > 0 ? sum : 0;
    };

    const calcAverageForSort = (contestant: string): number => {
      const total = calcTotalForSort(contestant);
      const count = judges.filter(
        (judge) => getScoreForSort(contestant, judge) !== null
      ).length;
      return count > 0 ? total / count : 0;
    };

    const sorted = [...contestants].sort((a, b) => {
      let aValue: number | string = 0;
      let bValue: number | string = 0;

      if (sortColumn === "number") {
        // For number column, try to parse as number first
        const aNumStr = contestantNumbers[a] || "";
        const bNumStr = contestantNumbers[b] || "";
        const aNum = parseFloat(aNumStr);
        const bNum = parseFloat(bNumStr);
        
        // If both are valid numbers, sort as numbers
        if (!isNaN(aNum) && !isNaN(bNum) && aNumStr.trim() !== "" && bNumStr.trim() !== "") {
          aValue = aNum;
          bValue = bNum;
        } else if (!isNaN(aNum) && aNumStr.trim() !== "") {
          // a is number, b is not - numbers come first
          aValue = aNum;
          bValue = isNaN(bNum) ? Infinity : bNum;
        } else if (!isNaN(bNum) && bNumStr.trim() !== "") {
          // b is number, a is not - numbers come first
          aValue = isNaN(aNum) ? Infinity : aNum;
          bValue = bNum;
        } else {
          // Both are not numbers, sort as strings
          aValue = aNumStr;
          bValue = bNumStr;
        }
      } else if (sortColumn === "total") {
        aValue = calcTotalForSort(a);
        bValue = calcTotalForSort(b);
      } else if (sortColumn === "average") {
        aValue = calcAverageForSort(a);
        bValue = calcAverageForSort(b);
      }

      // Always sort as numbers for all columns
      const aNum = typeof aValue === "string" ? parseFloat(aValue) : aValue;
      const bNum = typeof bValue === "string" ? parseFloat(bValue) : bValue;
      
      // Handle NaN cases
      if (isNaN(aNum as number) && isNaN(bNum as number)) {
        return 0;
      }
      if (isNaN(aNum as number)) {
        return sortDirection === "asc" ? 1 : -1; // NaN goes to end
      }
      if (isNaN(bNum as number)) {
        return sortDirection === "asc" ? -1 : 1; // NaN goes to end
      }
      
      return sortDirection === "asc"
        ? (aNum as number) - (bNum as number)
        : (bNum as number) - (aNum as number);
    });

    return sorted;
  }, [
    contestants,
    sortColumn,
    sortDirection,
    contestantNumbers,
    judges,
    scoreMap,
  ]);

  // Update contestantKeys for sorted contestants
  const sortedContestantKeys = useMemo(() => {
    return sortedContestants.map((name, index) => {
      const originalIndex = contestants.indexOf(name);
      const random = Math.random().toString(36).substring(2, 9);
      return `${originalIndex}_${name}_${random}`;
    });
  }, [sortedContestants, contestants]);

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
    const headerRow = ["海选号", "选手", ...judges, "总分", "平均分"];
    data.push(headerRow);

    // Data rows
    contestants.forEach((contestant) => {
      const row = [contestantNumbers[contestant] || "", contestant];
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

  const handleNumberDoubleClick = (contestant: string) => {
    setEditingNumber(contestant);
    setEditNumberValue(contestantNumbers[contestant] || "");
  };

  const handleNumberBlur = async () => {
    if (editingNumber === null) return;

    const match = await db.matches.get(matchId);
    if (!match) return;

    const now = Date.now();
    const updatedNumbers = {
      ...(match.contestantNumbers || {}),
      [editingNumber]: editNumberValue.trim(),
    };

    await db.matches.update(matchId, {
      contestantNumbers: updatedNumbers,
      updatedAt: now,
    });

    setEditingNumber(null);
    setEditNumberValue("");
    onUpdate();
  };

  const handleNumberKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleNumberBlur();
    } else if (e.key === "Escape") {
      setEditingNumber(null);
      setEditNumberValue("");
    }
  };

  const handleAddNewRow = () => {
    const initialScores: Record<string, string> = {};
    judges.forEach((judge) => {
      initialScores[judge] = "";
    });
    setEditingRow({
      contestant: "",
      number: "",
      scores: initialScores,
      isNew: true,
    });
  };

  const handleEditRow = (contestant: string) => {
    const initialScores: Record<string, string> = {};
    judges.forEach((judge) => {
      const score = getScore(contestant, judge);
      initialScores[judge] = score !== null ? score.toString() : "";
    });
    setEditingRow({
      contestant,
      number: contestantNumbers[contestant] || "",
      scores: initialScores,
      isNew: false,
      originalName: contestant,
    });
  };

  const handleRowSave = async () => {
    if (!editingRow) return;

    if (!editingRow.contestant.trim()) {
      alert("请输入选手名称");
      return;
    }

    const match = await db.matches.get(matchId);
    if (!match) return;

    const now = Date.now();
    const contestantName = editingRow.contestant.trim();

    // Validate and parse scores
    const scoreValues: Record<string, number | null> = {};
    for (const judge of judges) {
      const scoreStr = editingRow.scores[judge]?.trim() || "";
      if (scoreStr === "") {
        scoreValues[judge] = null;
      } else {
        const numValue = parseFloat(scoreStr);
        if (isNaN(numValue) || numValue < 0 || numValue > 100) {
          alert(`裁判 "${judge}" 的分数无效 (0-100)`);
          return;
        }
        scoreValues[judge] = numValue;
      }
    }

    if (editingRow.isNew) {
      // Add new contestant
      if (match.contestants.includes(contestantName)) {
        alert("该选手已存在");
        return;
      }

      const updatedContestants = [...match.contestants, contestantName];
      const updatedNumbers = {
        ...(match.contestantNumbers || {}),
        [contestantName]: editingRow.number.trim(),
      };

      await db.matches.update(matchId, {
        contestants: updatedContestants,
        contestantNumbers: updatedNumbers,
        updatedAt: now,
      });

      // Add scores
      for (const judge of judges) {
        if (scoreValues[judge] !== null) {
          await db.scores.add({
            matchId,
            contestant: contestantName,
            judge,
            value: scoreValues[judge],
            updatedAt: now,
          });
        }
      }
    } else {
      // Update existing contestant
      const oldName = editingRow.originalName!;
      const newName = contestantName;

      if (oldName !== newName) {
        // Name changed, need to update all references
        if (match.contestants.includes(newName) && oldName !== newName) {
          alert("该选手名称已存在");
          return;
        }

        const updatedContestants = match.contestants.map((c) =>
          c === oldName ? newName : c
        );

        // Update scores - first update contestant name in all scores
        const allScores = await db.scores
          .where("matchId")
          .equals(matchId)
          .toArray();
        for (const score of allScores) {
          if (score.contestant === oldName) {
            await db.scores.update(score.id!, {
              contestant: newName,
              updatedAt: now,
            });
          }
        }

        // Update contestantNumbers
        const updatedNumbers = { ...(match.contestantNumbers || {}) };
        if (updatedNumbers[oldName] !== undefined) {
          updatedNumbers[newName] = editingRow.number.trim();
          delete updatedNumbers[oldName];
        } else {
          updatedNumbers[newName] = editingRow.number.trim();
        }

        await db.matches.update(matchId, {
          contestants: updatedContestants,
          contestantNumbers: updatedNumbers,
          updatedAt: now,
        });

        // Update scores for new name
        for (const judge of judges) {
          const existingScore = allScores.find(
            (s) => s.contestant === oldName && s.judge === judge
          );
          if (existingScore) {
            await db.scores.update(existingScore.id!, {
              contestant: newName,
              value: scoreValues[judge],
              updatedAt: now,
            });
          } else if (scoreValues[judge] !== null) {
            await db.scores.add({
              matchId,
              contestant: newName,
              judge,
              value: scoreValues[judge],
              updatedAt: now,
            });
          }
        }
      } else {
        // Only number and scores changed
        const updatedNumbers = {
          ...(match.contestantNumbers || {}),
          [oldName]: editingRow.number.trim(),
        };

        await db.matches.update(matchId, {
          contestantNumbers: updatedNumbers,
          updatedAt: now,
        });

        // Update scores
        for (const judge of judges) {
          const existingScore = scores.find(
            (s) => s.contestant === oldName && s.judge === judge
          );
          if (existingScore) {
            if (scoreValues[judge] === null) {
              await db.scores.delete(existingScore.id!);
            } else {
              await db.scores.update(existingScore.id!, {
                value: scoreValues[judge],
                updatedAt: now,
              });
            }
          } else if (scoreValues[judge] !== null) {
            await db.scores.add({
              matchId,
              contestant: oldName,
              judge,
              value: scoreValues[judge],
              updatedAt: now,
            });
          }
        }
      }
    }

    setEditingRow(null);
    onUpdate();
  };

  const handleRowCancel = () => {
    setEditingRow(null);
  };

  const handleDeleteContestant = async (contestant: string) => {
    if (
      !confirm(
        `确定要删除选手 "${contestant}" 吗？这将删除该选手的所有评分数据。`
      )
    ) {
      return;
    }

    await applyActions(matchId, [
      { type: "removeContestant", name: contestant },
    ]);
    onUpdate();
  };

  const handleSort = (column: "number" | "total" | "average") => {
    if (sortColumn === column) {
      // Toggle direction or clear
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortColumn(null);
        setSortDirection(null);
      }
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (column: "number" | "total" | "average") => {
    if (sortColumn !== column) {
      return "↓↑"; // Neutral sort icon
    }
    if (sortDirection === "asc") {
      return "↑";
    }
    if (sortDirection === "desc") {
      return "↓";
    }
    return "↓↑";
  };

  if (judges.length === 0 && contestants.length === 0) {
    return (
      <div className="card">
        <div className="flex-between mb-3">
          <h2 style={{ margin: 0, color: "var(--dark)" }}>评分表</h2>
          <div
            style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}
          >
            {children}
            <button className="btn btn-special" onClick={handleExportExcel}>
              📊 导出 Excel
            </button>
          </div>
        </div>
        <div style={{ textAlign: "center", padding: "2.5rem", color: "#666" }}>
          <p style={{ marginBottom: "1.5rem" }}>还没有添加选手，请先添加选手</p>
          <button
            className="btn btn-special"
            onClick={handleAddNewRow}
            style={{ minWidth: "7.5rem" }}
          >
            + 添加选手
          </button>
        </div>

        {editingRow &&
          (() => {
            // Calculate total and average
            let total = 0;
            let count = 0;
            judges.forEach((judge) => {
              const scoreStr = editingRow.scores[judge]?.trim() || "";
              if (scoreStr !== "") {
                const numValue = parseFloat(scoreStr);
                if (!isNaN(numValue)) {
                  total += numValue;
                  count++;
                }
              }
            });
            const average = count > 0 ? total / count : 0;

            return (
              <div className="modal-overlay" onClick={handleRowCancel}>
                <div
                  className="modal-content"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    maxWidth: "31.25rem",
                    maxHeight: "80vh",
                    overflowY: "auto",
                    margin: "auto",
                  }}
                >
                  <div className="modal-header">
                    <h2 className="modal-title">
                      {editingRow.isNew ? "添加选手" : "编辑选手"}
                    </h2>
                    <button className="modal-close" onClick={handleRowCancel}>
                      ×
                    </button>
                  </div>
                  <div>
                    <table
                      style={{ width: "100%", borderCollapse: "collapse" }}
                    >
                      <tbody>
                        <tr>
                          <td
                            style={{
                              padding: "0.5rem",
                              fontWeight: 600,
                              width: "6.25rem",
                            }}
                          >
                            海选号：
                          </td>
                          <td style={{ padding: "0.5rem" }}>
                            <input
                              className="input"
                              type="text"
                              value={editingRow.number}
                              onChange={(e) =>
                                setEditingRow({
                                  ...editingRow,
                                  number: e.target.value,
                                })
                              }
                              placeholder="输入海选号"
                              autoFocus={!editingRow.isNew}
                              style={{ width: "100%" }}
                            />
                          </td>
                        </tr>
                        <tr>
                          <td style={{ padding: "0.5rem", fontWeight: 600 }}>
                            选手名称：
                          </td>
                          <td style={{ padding: "0.5rem" }}>
                            <input
                              className="input"
                              type="text"
                              value={editingRow.contestant}
                              onChange={(e) =>
                                setEditingRow({
                                  ...editingRow,
                                  contestant: e.target.value,
                                })
                              }
                              placeholder="输入选手名称"
                              autoFocus={editingRow.isNew}
                              style={{ width: "100%" }}
                            />
                          </td>
                        </tr>
                        {judges.map((judge) => (
                          <tr key={judge}>
                            <td style={{ padding: "0.5rem", fontWeight: 600 }}>
                              {judge}：
                            </td>
                            <td style={{ padding: "0.5rem" }}>
                              <input
                                className="input"
                                type="text"
                                value={editingRow.scores[judge] || ""}
                                onChange={(e) =>
                                  setEditingRow({
                                    ...editingRow,
                                    scores: {
                                      ...editingRow.scores,
                                      [judge]: e.target.value,
                                    },
                                  })
                                }
                                placeholder="输入分数"
                                style={{ width: "100%" }}
                              />
                            </td>
                          </tr>
                        ))}
                        <tr>
                          <td style={{ padding: "0.5rem", fontWeight: 600 }}>
                            总分：
                          </td>
                          <td style={{ padding: "0.5rem" }}>
                            <input
                              className="input"
                              type="text"
                              value={total.toFixed(2)}
                              readOnly
                              style={{
                                width: "100%",
                                background: "#f5f5f5",
                                cursor: "not-allowed",
                              }}
                            />
                          </td>
                        </tr>
                        <tr>
                          <td style={{ padding: "0.5rem", fontWeight: 600 }}>
                            平均分：
                          </td>
                          <td style={{ padding: "0.5rem" }}>
                            <input
                              className="input"
                              type="text"
                              value={average.toFixed(2)}
                              readOnly
                              style={{
                                width: "100%",
                                background: "#f5f5f5",
                                cursor: "not-allowed",
                              }}
                            />
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <div
                      style={{
                        display: "flex",
                        gap: "0.75rem",
                        justifyContent: "flex-end",
                        marginTop: "1rem",
                      }}
                    >
                      <button
                        className="btn btn-outline"
                        onClick={handleRowCancel}
                      >
                        取消
                      </button>
                      <button
                        className="btn btn-special"
                        onClick={handleRowSave}
                      >
                        {editingRow.isNew ? "确定添加" : "确定修改"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex-between mb-3">
        <h2 style={{ margin: 0, color: "var(--dark)" }}>评分表</h2>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
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
              <th
                onClick={() => handleSort("number")}
                style={{
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                海选号{" "}
                <i
                  style={{
                    display: "inline-block",
                    width: "1rem",
                    textAlign: "center",
                    color:
                      sortColumn === "number"
                        ? "rgba(207, 182, 231, 1)"
                        : "rgba(255, 255, 255, 0.3)",
                    fontWeight: "bold",
                  }}
                >
                  {getSortIcon("number")}
                </i>
              </th>
              <th>选手</th>
              {judges.map((judge) => (
                <th key={judge}>{judge}</th>
              ))}
              <th
                onClick={() => handleSort("total")}
                style={{
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                总分{" "}
                <i
                  style={{
                    display: "inline-block",
                    width: "1rem",
                    textAlign: "center",
                    color:
                      sortColumn === "total"
                        ? "rgba(207, 182, 231, 1)"
                        : "rgba(255, 255, 255, 0.3)",
                    fontWeight: "bold",
                  }}
                >
                  {getSortIcon("total")}
                </i>
              </th>
              <th
                onClick={() => handleSort("average")}
                style={{
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                均分{" "}
                <i
                  style={{
                    display: "inline-block",
                    width: "1rem",
                    textAlign: "center",
                    color:
                      sortColumn === "average"
                        ? "rgba(207, 182, 231, 1)"
                        : "rgba(255, 255, 255, 0.3)",
                    fontWeight: "bold",
                  }}
                >
                  {getSortIcon("average")}
                </i>
              </th>
              <th style={{ width: "1.875rem" }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {sortedContestants.map((contestant, index) => {
              const uniqueKey = sortedContestantKeys[index];
              const isEven = index % 2 === 0;

              return (
                <tr
                  key={uniqueKey}
                  onClick={() => handleEditRow(contestant)}
                  style={{
                    cursor: "pointer",
                    background: isEven
                      ? "rgba(255, 255, 255, 0.8)"
                      : "rgba(255, 255, 255, 0.95)",
                  }}
                >
                  <td
                    className="editable"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      handleNumberDoubleClick(contestant);
                    }}
                    style={{
                      minWidth: "5rem",
                      background:
                        sortColumn === "number"
                          ? "rgba(138, 43, 226, 0.15)"
                          : "transparent",
                    }}
                  >
                    {editingNumber === contestant ? (
                      <input
                        type="text"
                        value={editNumberValue}
                        onChange={(e) => setEditNumberValue(e.target.value)}
                        onBlur={handleNumberBlur}
                        onKeyDown={handleNumberKeyDown}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          width: "100%",
                          padding: "0.25rem",
                          border: "0.125rem solid #000",
                          borderRadius: "0.25rem",
                        }}
                      />
                    ) : (
                      contestantNumbers[contestant] || "-"
                    )}
                  </td>
                  <td style={{ fontWeight: 600 }}>{contestant}</td>
                  {judges.map((judge) => {
                    const isEditingCell =
                      editingCell?.contestant === contestant &&
                      editingCell?.judge === judge;
                    const score = getScore(contestant, judge);
                    const isEmpty = score === null;

                    return (
                      <td
                        key={judge}
                        className={`editable ${isEmpty ? "empty" : ""}`}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          handleCellDoubleClick(contestant, judge);
                        }}
                      >
                        {isEditingCell ? (
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={handleCellBlur}
                            onKeyDown={handleCellKeyDown}
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              width: "100%",
                              padding: "0.25rem",
                              border: "0.125rem solid #000",
                              borderRadius: "0.25rem",
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
                  <td
                    style={{
                      fontWeight: 600,
                      background:
                        sortColumn === "total"
                          ? "rgba(138, 43, 226, 0.15)"
                          : "transparent",
                    }}
                  >
                    {calculateTotal(contestant).toFixed(2)}
                  </td>
                  <td
                    style={{
                      fontWeight: 600,
                      background:
                        sortColumn === "average"
                          ? "rgba(138, 43, 226, 0.15)"
                          : "transparent",
                    }}
                  >
                    {calculateAverage(contestant).toFixed(2)}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteContestant(contestant);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: "0.25rem",
                        fontSize: "1.125rem",
                        fontWeight: "bold",
                        color: "#ff6b6b",
                        lineHeight: "1",
                      }}
                      title="删除"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
            <tr>
              <td
                style={{
                  cursor: "pointer",
                  background: "rgba(0, 0, 0, 0.05)",
                  fontWeight: 600,
                  textAlign: "center",
                }}
                onClick={handleAddNewRow}
                title="添加选手"
                colSpan={judges.length + 5}
              >
                +
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {contestants.length === 0 && (
        <p style={{ textAlign: "center", color: "#666", marginTop: "1rem" }}>
          还没有添加选手
        </p>
      )}

      {editingRow &&
        (() => {
          // Calculate total and average
          let total = 0;
          let count = 0;
          judges.forEach((judge) => {
            const scoreStr = editingRow.scores[judge]?.trim() || "";
            if (scoreStr !== "") {
              const numValue = parseFloat(scoreStr);
              if (!isNaN(numValue)) {
                total += numValue;
                count++;
              }
            }
          });
          const average = count > 0 ? total / count : 0;

          return (
            <div className="modal-overlay" onClick={handleRowCancel}>
              <div
                className="modal-content"
                onClick={(e) => e.stopPropagation()}
                style={{
                  maxWidth: "31.25rem",
                  maxHeight: "80vh",
                  overflowY: "auto",
                  margin: "auto",
                }}
              >
                <div className="modal-header">
                  <h2 className="modal-title">
                    {editingRow.isNew ? "添加选手" : "编辑选手"}
                  </h2>
                  <button className="modal-close" onClick={handleRowCancel}>
                    ×
                  </button>
                </div>
                <div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <tbody>
                      <tr>
                        <td
                          style={{
                            padding: "0.5rem",
                            fontWeight: 600,
                            width: "6.25rem",
                          }}
                        >
                          海选号：
                        </td>
                        <td style={{ padding: "0.5rem" }}>
                          <input
                            className="input"
                            type="text"
                            value={editingRow.number}
                            onChange={(e) =>
                              setEditingRow({
                                ...editingRow,
                                number: e.target.value,
                              })
                            }
                            placeholder="输入海选号"
                            autoFocus={!editingRow.isNew}
                            style={{ width: "100%" }}
                          />
                        </td>
                      </tr>
                      <tr>
                        <td style={{ padding: "0.5rem", fontWeight: 600 }}>
                          选手名称：
                        </td>
                        <td style={{ padding: "0.5rem" }}>
                          <input
                            className="input"
                            type="text"
                            value={editingRow.contestant}
                            onChange={(e) =>
                              setEditingRow({
                                ...editingRow,
                                contestant: e.target.value,
                              })
                            }
                            placeholder="输入选手名称"
                            autoFocus={editingRow.isNew}
                            style={{ width: "100%" }}
                          />
                        </td>
                      </tr>
                      {judges.map((judge) => (
                        <tr key={judge}>
                          <td style={{ padding: "0.5rem", fontWeight: 600 }}>
                            {judge}：
                          </td>
                          <td style={{ padding: "0.5rem" }}>
                            <input
                              className="input"
                              type="text"
                              value={editingRow.scores[judge] || ""}
                              onChange={(e) =>
                                setEditingRow({
                                  ...editingRow,
                                  scores: {
                                    ...editingRow.scores,
                                    [judge]: e.target.value,
                                  },
                                })
                              }
                              placeholder="输入分数"
                              style={{ width: "100%" }}
                            />
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <td style={{ padding: "0.5rem", fontWeight: 600 }}>
                          总分：
                        </td>
                        <td style={{ padding: "0.5rem" }}>
                          <input
                            className="input"
                            type="text"
                            value={total.toFixed(2)}
                            readOnly
                            style={{
                              width: "100%",
                              background: "#f5f5f5",
                              cursor: "not-allowed",
                            }}
                          />
                        </td>
                      </tr>
                      <tr>
                        <td style={{ padding: "0.5rem", fontWeight: 600 }}>
                          平均分：
                        </td>
                        <td style={{ padding: "0.5rem" }}>
                          <input
                            className="input"
                            type="text"
                            value={average.toFixed(2)}
                            readOnly
                            style={{
                              width: "100%",
                              background: "#f5f5f5",
                              cursor: "not-allowed",
                            }}
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <div
                    style={{
                      display: "flex",
                      gap: "0.75rem",
                      justifyContent: "flex-end",
                      marginTop: "1rem",
                    }}
                  >
                    <button
                      className="btn btn-outline"
                      onClick={handleRowCancel}
                    >
                      取消
                    </button>
                    <button className="btn btn-special" onClick={handleRowSave}>
                      {editingRow.isNew ? "确定添加" : "确定修改"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
