import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { db, getMatchData } from "@/lib/db";
import { applyActions, Action } from "@/lib/actions";
import TableView from "@/components/TableView";
import AiPrompt from "@/components/AiPrompt";
import ConfirmModal from "@/components/ConfirmModal";

export default function MatchDetail() {
  const router = useRouter();
  const { id } = router.query;
  const matchId = id ? parseInt(id as string) : null;

  const [matchData, setMatchData] = useState<any>(null);
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const [pendingActions, setPendingActions] = useState<Action[] | null>(null);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [historyStack, setHistoryStack] = useState<any[]>([]);

  useEffect(() => {
    if (matchId) {
      loadMatchData();
    }
  }, [matchId]);

  const loadMatchData = async () => {
    if (!matchId) return;
    const data = await getMatchData(matchId);
    setMatchData(data);
  };

  const handleActionsGenerated = (actions: Action[]) => {
    setPendingActions(actions);
    setShowAiPrompt(false);
  };

  const handleConfirmActions = async () => {
    if (!matchId || !pendingActions) return;

    try {
      await applyActions(matchId, pendingActions);
      setPendingActions(null);
      await loadMatchData();
    } catch (error: any) {
      alert(`应用操作失败: ${error.message}`);
    }
  };

  const handleUndo = async () => {
    if (!matchId || historyIndex < 0) return;
    // TODO: Implement undo logic
    alert("Undo 功能待实现");
  };

  const handleRedo = async () => {
    if (!matchId || historyIndex >= historyStack.length - 1) return;
    // TODO: Implement redo logic
    alert("Redo 功能待实现");
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
    <div className="container">
      <div style={{ marginBottom: "20px" }}>
        <button
          className="btn btn-non-outline"
          onClick={() => router.push("/")}
          style={{ marginBottom: "16px" }}
        >
          ← 返回列表
        </button>
        <div className="card">
          <h2 style={{ margin: 0, color: "var(--dark)" }}>
            {matchData.match.name}
          </h2>
          <div style={{ marginTop: "0.5em", color: "#666", fontSize: "0.8em" }}>
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
      >
        <div
          style={{
            display: "flex",
            gap: "12px",
            justifyContent: "center",
          }}
        >
          <button
            className="btn btn-s btn-outline"
            onClick={handleUndo}
            disabled={historyIndex < 0}
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
          matchData={matchData}
          onActionsGenerated={handleActionsGenerated}
          onClose={() => setShowAiPrompt(false)}
        />
      )}

      {pendingActions && (
        <ConfirmModal
          actions={pendingActions}
          onConfirm={handleConfirmActions}
          onCancel={() => setPendingActions(null)}
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
