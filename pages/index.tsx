import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { db, Match, createMatch } from '@/lib/db';
import Link from 'next/link';

export default function Home() {
  const router = useRouter();
  const [matches, setMatches] = useState<Match[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newMatchName, setNewMatchName] = useState('');
  const [judgeNames, setJudgeNames] = useState('');
  const [contestantNames, setContestantNames] = useState('');
  const [matchToDelete, setMatchToDelete] = useState<Match | null>(null);
  const [deleteConfirmCount, setDeleteConfirmCount] = useState(0);

  useEffect(() => {
    loadMatches();
  }, []);

  const loadMatches = async () => {
    const allMatches = await db.matches.orderBy('updatedAt').reverse().toArray();
    setMatches(allMatches);
  };

  const handleCreateMatch = async () => {
    if (!newMatchName.trim()) {
      alert('请输入比赛名称');
      return;
    }

    const judgeList = judgeNames.split(/[,\n]/).map(s => s.trim()).filter(s => s);
    const contestantList = contestantNames.split(/[,\n]/).map(s => s.trim()).filter(s => s);

    const matchId = await createMatch(newMatchName, judgeList, contestantList);
    setShowCreateModal(false);
    setNewMatchName('');
    setJudgeNames('');
    setContestantNames('');
    router.push(`/match/${matchId}`);
  };

  const handleDeleteClick = (match: Match) => {
    setMatchToDelete(match);
    setDeleteConfirmCount(0);
  };

  const handleConfirmDelete = async () => {
    if (!matchToDelete || !matchToDelete.id) return;
    
    // First click - show warning
    if (deleteConfirmCount === 0) {
      setDeleteConfirmCount(1);
      return;
    }
    
    // Second click - actually delete
    const matchId = matchToDelete.id;
    await db.matches.delete(matchId);
    await db.scores.where('matchId').equals(matchId).delete();
    await db.history.where('matchId').equals(matchId).delete();
    setMatchToDelete(null);
    setDeleteConfirmCount(0);
    loadMatches();
  };

  const handleCancelDelete = () => {
    setMatchToDelete(null);
    setDeleteConfirmCount(0);
  };

  return (
    <div className="container">
      <div style={{ textAlign: 'center', marginBottom: '40px', paddingTop: '40px' }}>
        <h1 style={{ fontSize: '48px', marginBottom: '16px', textShadow: '2px 2px 4px rgba(0,0,0,0.2)' }}>
          Genesis Tribe
        </h1>
      </div>

      <div className="card">
        <div className="flex-between mb-3">
          <h2 style={{ margin: 0, color: 'var(--dark)' }}>🏆比赛列表</h2>
          <button className="btn btn-special" onClick={() => setShowCreateModal(true)}>
            + 创建比赛
          </button>
        </div>

        {matches.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
            <p>还没有比赛，点击上方按钮创建第一个比赛吧！</p>
          </div>
        ) : (
          <ul className="list">
            {matches.map(match => (
              <li key={match.id} className="list-item">
                <div>
                  <Link href={`/match/${match.id}`} style={{ fontSize: '18px', fontWeight: 600, color: 'var(--dark)' }}>
                    {match.name}
                  </Link>
                  <div style={{ fontSize: '14px', color: '#666', marginTop: '4px' }}>
                    创建于：{new Date(match.createdAt).toLocaleString('zh-CN')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Link href={`/match/${match.id}`} className="btn btn-secondary" style={{ fontSize: '14px', padding: '8px 16px' }}>
                    查看
                  </Link>
                  <button
                    className="btn btn-outline"
                    onClick={() => handleDeleteClick(match)}
                    style={{ fontSize: '14px', padding: '8px 16px' }}
                  >
                    删除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">创建新比赛</h2>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>×</button>
            </div>
            <div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                  比赛名称 *
                </label>
                <input
                  className="input"
                  type="text"
                  value={newMatchName}
                  onChange={e => setNewMatchName(e.target.value)}
                  placeholder="例如：年度比赛"
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                  裁判名称（用逗号或换行分隔）
                </label>
                <textarea
                  className="input"
                  rows={3}
                  value={judgeNames}
                  onChange={e => setJudgeNames(e.target.value)}
                  placeholder="例如：Judge A, Judge B, Judge C"
                />
              </div>
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                  选手名称（用逗号或换行分隔, 可先不填写）
                </label>
                <textarea
                  className="input"
                  rows={3}
                  value={contestantNames}
                  onChange={e => setContestantNames(e.target.value)}
                  placeholder="例如：张三, 李四, 王五"
                />
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button className="btn btn-outline" onClick={() => setShowCreateModal(false)}>
                  取消
                </button>
                <button className="btn btn-special" onClick={handleCreateMatch}>
                  创建
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {matchToDelete && (
        <div className="modal-overlay" onClick={handleCancelDelete}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">确认删除</h2>
              <button className="modal-close" onClick={handleCancelDelete}>×</button>
            </div>
            <div>
              {deleteConfirmCount === 0 ? (
                <>
                  <p style={{ marginBottom: '16px', color: '#666', fontSize: '16px' }}>
                    您确定要删除比赛 <strong style={{ color: 'var(--dark)' }}>"{matchToDelete.name}"</strong> 吗？
                  </p>
                  <p style={{ marginBottom: '24px', color: '#999', fontSize: '14px' }}>
                    此操作将永久删除该比赛及其所有评分数据，且无法恢复。
                  </p>
                </>
              ) : (
                <>
                  <p style={{ marginBottom: '16px', color: '#ff6b6b', fontSize: '18px', fontWeight: 600 }}>
                    ⚠️ 最后确认
                  </p>
                  <p style={{ marginBottom: '16px', color: '#666', fontSize: '16px' }}>
                    您即将永久删除比赛 <strong style={{ color: 'var(--dark)' }}>"{matchToDelete.name}"</strong>
                  </p>
                  <p style={{ marginBottom: '24px', color: '#ff6b6b', fontSize: '14px', fontWeight: 600 }}>
                    此操作无法撤销！请再次点击确认删除按钮。
                  </p>
                </>
              )}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button className="btn btn-outline" onClick={handleCancelDelete}>
                  取消
                </button>
                <button 
                  className="btn btn-outline" 
                  onClick={handleConfirmDelete}
                  style={{ 
                    background: deleteConfirmCount === 0 ? 'rgba(255, 107, 107, 0.15)' : 'rgba(255, 107, 107, 0.3)',
                    borderColor: deleteConfirmCount === 0 ? 'rgba(255, 107, 107, 0.4)' : 'rgba(255, 107, 107, 0.8)',
                    color: deleteConfirmCount === 0 ? 'var(--dark)' : '#ff6b6b',
                    fontWeight: deleteConfirmCount === 1 ? 700 : 600
                  }}
                >
                  {deleteConfirmCount === 0 ? '确认删除' : '最后确认删除'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

