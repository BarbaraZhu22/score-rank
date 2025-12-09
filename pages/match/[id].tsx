import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { db, getMatchData, Score } from "@/lib/db";
import { applyActions, Action } from "@/lib/actions";
import TableView from "@/components/TableView";
import AiPrompt from "@/components/AiPrompt";
import ConfirmModal from "@/components/ConfirmModal";

interface HistorySnapshot {
  contestants: string[];
  contestantNumbers: Record<string, string>;
  scores: Array<{ contestant: string; judge: string; value: number | null }>;
}

export default function MatchDetail() {
  const router = useRouter();
  const { id } = router.query;
  const matchId = id ? parseInt(id as string) : null;

  const [matchData, setMatchData] = useState<any>(null);
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const [pendingActions, setPendingActions] = useState<Action[] | null>(null);
  const [historyStack, setHistoryStack] = useState<HistorySnapshot[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [aiPromptKey, setAiPromptKey] = useState(0); // Key to reset AiPrompt state
  const MAX_HISTORY = 20;

  useEffect(() => {
    if (matchId) {
      loadMatchData();
    }
  }, [matchId]);

  // Initialize history with current state when matchData is loaded
  useEffect(() => {
    if (matchData && historyStack.length === 0) {
      const initialSnapshot: HistorySnapshot = {
        contestants: [...matchData.contestants],
        contestantNumbers: { ...(matchData.match.contestantNumbers || {}) },
        scores: matchData.scores.map((s: any) => ({
          contestant: s.contestant,
          judge: s.judge,
          value: s.value,
        })),
      };
      setHistoryStack([initialSnapshot]);
      setHistoryIndex(0);
    }
  }, [matchData]);

  const loadMatchData = async () => {
    if (!matchId) return;
    const data = await getMatchData(matchId);
    setMatchData(data);
  };

  // Save current state as history snapshot before CRUD operations
  const saveHistorySnapshot = async () => {
    if (!matchId || !matchData) return;

    const snapshot: HistorySnapshot = {
      contestants: [...matchData.contestants],
      contestantNumbers: { ...(matchData.match.contestantNumbers || {}) },
      scores: matchData.scores.map((s: Score) => ({
        contestant: s.contestant,
        judge: s.judge,
        value: s.value,
      })),
    };

    // If we're not at the end of history, remove everything after current index
    let newStack: HistorySnapshot[];
    if (historyIndex < historyStack.length - 1) {
      newStack = historyStack.slice(0, historyIndex + 1);
    } else {
      newStack = [...historyStack];
    }

    // Add new snapshot
    newStack.push(snapshot);

    // Limit to MAX_HISTORY
    if (newStack.length > MAX_HISTORY) {
      newStack = newStack.slice(-MAX_HISTORY);
    }

    setHistoryStack(newStack);
    setHistoryIndex(newStack.length - 1);
  };

  // Restore state from history snapshot
  const restoreSnapshot = async (snapshot: HistorySnapshot) => {
    if (!matchId) return;

    const match = await db.matches.get(matchId);
    if (!match) return;

    const now = Date.now();

    // Restore contestants
    await db.matches.update(matchId, {
      contestants: snapshot.contestants,
      contestantNumbers: snapshot.contestantNumbers,
      updatedAt: now,
    });

    // Delete all current scores
    const currentScores = await db.scores.where('matchId').equals(matchId).toArray();
    await Promise.all(currentScores.map(score => db.scores.delete(score.id!)));

    // Restore scores
    for (const scoreData of snapshot.scores) {
      if (scoreData.value !== null) {
        await db.scores.add({
          matchId,
          contestant: scoreData.contestant,
          judge: scoreData.judge,
          value: scoreData.value,
          updatedAt: now,
        });
      }
    }

    await loadMatchData();
  };

  const handleActionsGenerated = (actions: Action[]) => {
    setPendingActions(actions);
    // Don't close AiPrompt - keep it open so user can modify input if they cancel
  };

  const handleConfirmActions = async () => {
    if (!matchId || !pendingActions) return;

    try {
      await saveHistorySnapshot();
      await applyActions(matchId, pendingActions);
      setPendingActions(null);
      await loadMatchData();
      // Close AiPrompt and reset its state after successful application
      setShowAiPrompt(false);
      setAiPromptKey(prev => prev + 1); // Reset AiPrompt state
    } catch (error: any) {
      alert(`应用操作失败: ${error.message}`);
    }
  };

  const handleCancelActions = () => {
    // Only close ConfirmModal, keep AiPrompt open with original input
    setPendingActions(null);
  };

  const handleUndo = async () => {
    if (!matchId || historyIndex < 0) return;
    
    const targetIndex = historyIndex - 1;
    if (targetIndex < 0) {
      alert("没有可撤销的操作");
      return;
    }

    const snapshot = historyStack[targetIndex];
    await restoreSnapshot(snapshot);
    setHistoryIndex(targetIndex);
  };

  const handleRedo = async () => {
    if (!matchId || historyIndex >= historyStack.length - 1) return;
    
    const targetIndex = historyIndex + 1;
    const snapshot = historyStack[targetIndex];
    await restoreSnapshot(snapshot);
    setHistoryIndex(targetIndex);
  };

  if (!matchId || !matchData) {
    return (
      <div className="container">
        <div className="card">
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container match-detail-page">
      <div style={{ marginBottom: "1.125rem" }}>
        <button
          className="btn btn-non-outline"
          onClick={() => router.push("/")}
          style={{ marginBottom: "0.875rem" }}
        >
          ← 返回列表
        </button>
        <div className="card">
          <h2 style={{ margin: 0, color: "var(--dark)" }}>
            {matchData.match.name}
          </h2>
          <div style={{ marginTop: "0.5em", color: "#666", fontSize: "0.75em" }}>
            更新于：
            {new Date(matchData.match.updatedAt).toLocaleString("zh-CN")}
          </div>
        </div>
      </div>

      <TableView
        matchId={matchId}
        judges={matchData.judges}
        contestants={matchData.contestants}
        scores={matchData.scores}
        contestantNumbers={matchData.match.contestantNumbers}
        onUpdate={loadMatchData}
        onBeforeUpdate={saveHistorySnapshot}
      >
        <div
          style={{
            display: "flex",
            gap: "0.4375rem",
            justifyContent: "center",
          }}
        >
          <button
            className="btn btn-s btn-outline"
            onClick={handleUndo}
            disabled={historyIndex <= 0}
          >
            ↶ 撤销
          </button>
          <button
            className="btn btn-s btn-outline"
            onClick={handleRedo}
            disabled={historyIndex >= historyStack.length - 1}
          >
            ↷ 恢复
          </button>
        </div>
      </TableView>

      {showAiPrompt && (
        <AiPrompt
          key={aiPromptKey}
          matchData={matchData}
          onActionsGenerated={handleActionsGenerated}
          onClose={() => {
            setShowAiPrompt(false);
            setAiPromptKey(prev => prev + 1); // Reset state when manually closed
          }}
        />
      )}

      {pendingActions && (
        <ConfirmModal
          actions={pendingActions}
          onConfirm={handleConfirmActions}
          onCancel={handleCancelActions}
        />
      )}

      <button
        className="fab"
        onClick={() => setShowAiPrompt(true)}
        title="AI 助手"
      >
        🤖
      </button>
    </div>
  );
}
