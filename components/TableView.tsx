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
  onBeforeUpdate?: () => Promise<void>;
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
  judges = [],
  contestants = [],
  scores = [],
  contestantNumbers = {},
  onUpdate,
  onBeforeUpdate,
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
  const [showOperations, setShowOperations] = useState(false);

  // Create a map for quick score lookup
  const scoreMap = useMemo(() => {
    try {
      const map = new Map<string, number | null>();
      if (Array.isArray(scores)) {
        scores.forEach((score) => {
          if (score && score.contestant && score.judge) {
            const key = `${score.contestant}|${score.judge}`;
            map.set(key, score.value ?? null);
          }
        });
      }
      return map;
    } catch (error) {
      console.error("Error creating score map:", error);
      return new Map<string, number | null>();
    }
  }, [scores]);

  // Generate unique keys for contestants
  const contestantKeys = useMemo(() => {
    try {
      if (!Array.isArray(contestants)) {
        return [];
      }
      return contestants.map((name, index) => {
        const safeName = String(name || "");
        const random = Math.random().toString(36).substring(2, 9);
        return `${index}_${safeName}_${random}`;
      });
    } catch (error) {
      console.error("Error generating contestant keys:", error);
      return [];
    }
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
        if (
          !isNaN(aNum) &&
          !isNaN(bNum) &&
          aNumStr.trim() !== "" &&
          bNumStr.trim() !== ""
        ) {
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
    try {
      if (!Array.isArray(sortedContestants) || !Array.isArray(contestants)) {
        return [];
      }
      return sortedContestants.map((name, index) => {
        const safeName = String(name || "");
        const originalIndex = contestants.indexOf(name);
        const random = Math.random().toString(36).substring(2, 9);
        return `${
          originalIndex >= 0 ? originalIndex : index
        }_${safeName}_${random}`;
      });
    } catch (error) {
      console.error("Error generating sorted contestant keys:", error);
      return [];
    }
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

    try {
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
      const existingScore = Array.isArray(scores)
        ? scores.find(
            (s) =>
              s &&
              s.contestant === editingCell.contestant &&
              s.judge === editingCell.judge
          )
        : null;

      const now = Date.now();
      if (existingScore && existingScore.id) {
        await db.scores.update(existingScore.id, {
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
      if (onBeforeUpdate) {
        try {
          await onBeforeUpdate();
        } catch (error) {
          console.error("Error in onBeforeUpdate:", error);
        }
      }
      if (onUpdate) {
        try {
          onUpdate();
        } catch (error) {
          console.error("Error in onUpdate:", error);
        }
      }
    } catch (error) {
      console.error("Error saving cell:", error);
      alert("保存失败，请重试");
      setEditingCell(null);
    }
  };

  const handleCellKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleCellBlur();
    } else if (e.key === "Escape") {
      setEditingCell(null);
    }
  };

  const calculateTotal = (contestant: string): number => {
    try {
      if (!contestant || !Array.isArray(judges)) {
        return 0;
      }
      let sum = 0;
      let count = 0;
      judges.forEach((judge) => {
        try {
          const score = getScore(contestant, judge);
          if (score !== null && !isNaN(score) && isFinite(score)) {
            sum += score;
            count++;
          }
        } catch (error) {
          console.error(
            `Error getting score for ${contestant}/${judge}:`,
            error
          );
        }
      });
      return count > 0 ? sum : 0;
    } catch (error) {
      console.error(`Error calculating total for ${contestant}:`, error);
      return 0;
    }
  };

  const calculateAverage = (contestant: string): number => {
    try {
      if (!contestant || !Array.isArray(judges)) {
        return 0;
      }
      const total = calculateTotal(contestant);
      const count = judges.filter((judge) => {
        try {
          return getScore(contestant, judge) !== null;
        } catch (error) {
          return false;
        }
      }).length;
      return count > 0 && isFinite(total / count) ? total / count : 0;
    } catch (error) {
      console.error(`Error calculating average for ${contestant}:`, error);
      return 0;
    }
  };

  const handleExportExcel = () => {
    try {
      // Prepare data for Excel
      const data: any[][] = [];

      // Header row
      const headerRow = [
        "海选号",
        "选手",
        ...(Array.isArray(judges) ? judges : []),
        "总分",
      ];
      data.push(headerRow);

      // Data rows - use sortedContestants to maintain sort order
      if (Array.isArray(sortedContestants)) {
        sortedContestants.forEach((contestant) => {
          try {
            const safeContestant = String(contestant || "");
            const row = [
              (contestantNumbers && contestantNumbers[safeContestant]) || "",
              safeContestant,
            ];
            if (Array.isArray(judges)) {
              judges.forEach((judge) => {
                try {
                  const score = getScore(safeContestant, judge);
                  row.push(score !== null ? String(score) : "");
                } catch (error) {
                  console.error(
                    `Error getting score for ${safeContestant}/${judge}:`,
                    error
                  );
                  row.push("");
                }
              });
            }
            try {
              row.push(calculateTotal(safeContestant).toFixed(2));
            } catch (error) {
              console.error(
                `Error calculating totals for ${safeContestant}:`,
                error
              );
              row.push("0.00");
            }
            data.push(row);
          } catch (error) {
            console.error(`Error processing contestant ${contestant}:`, error);
          }
        });
      }

      // Create workbook and worksheet
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, "评分表");

      // Export
      XLSX.writeFile(wb, `比赛评分表_${Date.now()}.xlsx`);
    } catch (error) {
      console.error("Error exporting Excel:", error);
      alert("导出失败，请重试");
    }
  };

  const handleNumberDoubleClick = (contestant: string) => {
    setEditingNumber(contestant);
    setEditNumberValue(contestantNumbers[contestant] || "");
  };

  const handleNumberBlur = async () => {
    if (editingNumber === null) return;

    try {
      const match = await db.matches.get(matchId);
      if (!match) {
        alert("比赛数据不存在");
        setEditingNumber(null);
        setEditNumberValue("");
        return;
      }

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
      if (onBeforeUpdate) {
        try {
          await onBeforeUpdate();
        } catch (error) {
          console.error("Error in onBeforeUpdate:", error);
        }
      }
      if (onUpdate) {
        try {
          onUpdate();
        } catch (error) {
          console.error("Error in onUpdate:", error);
        }
      }
    } catch (error) {
      console.error("Error saving number:", error);
      alert("保存失败，请重试");
      setEditingNumber(null);
      setEditNumberValue("");
    }
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
    try {
      const initialScores: Record<string, string> = {};
      if (Array.isArray(judges)) {
        judges.forEach((judge) => {
          initialScores[judge] = "";
        });
      }
      setEditingRow({
        contestant: "",
        number: "",
        scores: initialScores,
        isNew: true,
      });
    } catch (error) {
      console.error("Error adding new row:", error);
      alert("添加失败，请重试");
    }
  };

  const handleEditRow = (contestant: string) => {
    try {
      const safeContestant = String(contestant || "");
      const initialScores: Record<string, string> = {};
      if (Array.isArray(judges)) {
        judges.forEach((judge) => {
          try {
            const score = getScore(safeContestant, judge);
            initialScores[judge] = score !== null ? score.toString() : "";
          } catch (error) {
            console.error(
              `Error getting score for ${safeContestant}/${judge}:`,
              error
            );
            initialScores[judge] = "";
          }
        });
      }
      setEditingRow({
        contestant: safeContestant,
        number: (contestantNumbers && contestantNumbers[safeContestant]) || "",
        scores: initialScores,
        isNew: false,
        originalName: safeContestant,
      });
    } catch (error) {
      console.error("Error editing row:", error);
      alert("编辑失败，请重试");
    }
  };

  const handleRowSave = async () => {
    if (!editingRow) return;

    try {
      if (!editingRow.contestant || !editingRow.contestant.trim()) {
        alert("请输入选手名称");
        return;
      }

      const match = await db.matches.get(matchId);
      if (!match) {
        alert("比赛数据不存在");
        setEditingRow(null);
        return;
      }

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

        if (onBeforeUpdate) {
          try {
            await onBeforeUpdate();
          } catch (error) {
            console.error("Error in onBeforeUpdate:", error);
          }
        }

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

        if (onBeforeUpdate) {
          try {
            await onBeforeUpdate();
          } catch (error) {
            console.error("Error in onBeforeUpdate:", error);
          }
        }

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
      if (onUpdate) {
        try {
          onUpdate();
        } catch (error) {
          console.error("Error in onUpdate:", error);
        }
      }
    } catch (error) {
      console.error("Error saving row:", error);
      alert("保存失败，请重试");
      // Don't close the dialog on error so user can retry
    }
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

    try {
      if (onBeforeUpdate) {
        try {
          await onBeforeUpdate();
        } catch (error) {
          console.error("Error in onBeforeUpdate:", error);
        }
      }
      await applyActions(matchId, [
        { type: "removeContestant", name: contestant },
      ]);
      if (onUpdate) {
        try {
          onUpdate();
        } catch (error) {
          console.error("Error in onUpdate:", error);
        }
      }
    } catch (error) {
      console.error("Error deleting contestant:", error);
      alert("删除失败，请重试");
    }
  };

  const handleSort = (column: "number" | "total") => {
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

  const getSortIcon = (column: "number" | "total") => {
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
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            {children}
            <button
              className="btn btn-s btn-outline"
              onClick={() => setShowOperations(!showOperations)}
            >
              {showOperations ? "隐藏操作" : "显示操作"}
            </button>
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
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {children}
          <button
            className="btn btn-s"
            onClick={() => setShowOperations(!showOperations)}
            style={{ fontSize: "0.7rem" }}
          >
            {showOperations ? "隐藏操作" : "显示操作"}
          </button>
          <button
            className="btn btn-special"
            style={{ fontSize: "0.7rem" }}
            onClick={handleExportExcel}
          >
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
              {showOperations && (
                <th style={{ width: "1.5rem", fontSize: "0.75rem" }}>操作</th>
              )}
            </tr>
          </thead>
          <tbody>
            {sortedContestants.map((contestant, index) => {
              const uniqueKey =
                sortedContestantKeys[index] ||
                `fallback_${index}_${contestant}`;
              const isEven = index % 2 === 0;
              const safeContestant = String(contestant || "");

              return (
                <tr
                  key={uniqueKey}
                  onClick={() => handleEditRow(safeContestant)}
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
                      handleNumberDoubleClick(safeContestant);
                    }}
                    style={{
                      minWidth: "5rem",
                      background:
                        sortColumn === "number"
                          ? "rgba(138, 43, 226, 0.15)"
                          : "transparent",
                    }}
                  >
                    {editingNumber === safeContestant ? (
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
                      (contestantNumbers &&
                        contestantNumbers[safeContestant]) ||
                      "-"
                    )}
                  </td>
                  <td style={{ fontWeight: 600, position: "relative" }}>
                    {safeContestant}
                    {sortColumn && sortDirection && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "1.5rem",
                          height: "1.5rem",
                          borderRadius: "50%",
                          background: "rgba(207, 182, 231, 1)",
                          color: "#000",
                          fontSize: "0.75rem",
                          fontWeight: "bold",
                          marginLeft: "0.5rem",
                          float: "right",
                        }}
                      >
                        {index + 1}
                      </span>
                    )}
                  </td>
                  {Array.isArray(judges) &&
                    judges.map((judge) => {
                      const safeJudge = String(judge || "");
                      const isEditingCell =
                        editingCell?.contestant === safeContestant &&
                        editingCell?.judge === safeJudge;
                      let score: number | null = null;
                      let isEmpty = true;
                      try {
                        score = getScore(safeContestant, safeJudge);
                        isEmpty = score === null;
                      } catch (error) {
                        console.error(
                          `Error getting score for ${safeContestant}/${safeJudge}:`,
                          error
                        );
                      }

                      return (
                        <td
                          key={judge}
                          className={`editable ${isEmpty ? "empty" : ""}`}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            handleCellDoubleClick(safeContestant, safeJudge);
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
                    {(() => {
                      try {
                        return calculateTotal(safeContestant).toFixed(2);
                      } catch (error) {
                        return "0.00";
                      }
                    })()}
                  </td>
                  {showOperations && (
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteContestant(safeContestant);
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: "0.125rem",
                          fontSize: "0.875rem",
                          fontWeight: "bold",
                          color: "#ff6b6b",
                          lineHeight: "1",
                        }}
                        title="删除"
                      >
                        ×
                      </button>
                    </td>
                  )}
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
                colSpan={judges.length + 3 + (showOperations ? 1 : 0)}
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
