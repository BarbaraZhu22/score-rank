import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { db, Match, createMatch } from '../lib/db';
import Link from 'next/link';

export default function Home() {
  const router = useRouter();
  const [matches, setMatches] = useState<Match[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newMatchName, setNewMatchName] = useState('');
  const [judgeNames, setJudgeNames] = useState('');
  const [contestantNames, setContestantNames] = useState('');

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

  const handleDeleteMatch = async (matchId: number) => {
    if (!confirm('确定要删除这个比赛吗？')) return;
    await db.matches.delete(matchId);
    await db.scores.where('matchId').equals(matchId).delete();
    await db.history.where('matchId').equals(matchId).delete();
    loadMatches();
  };

  return (
    <div className="container">
      <div style={{ textAlign: 'center', marginBottom: '40px', paddingTop: '40px' }}>
        <h1 style={{ fontSize: '48px', marginBottom: '16px', textShadow: '2px 2px 4px rgba(0,0,0,0.2)' }}>
          🏆 比赛管理系统
        </h1>
        <p style={{ fontSize: '20px', opacity: 0.9 }}>
          浏览器端 OCR + AI 自动评分
        </p>
      </div>

      <div className="card">
        <div className="flex-between mb-3">
          <h2 style={{ margin: 0, color: 'var(--dark)' }}>比赛列表</h2>
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
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
                    onClick={() => handleDeleteMatch(match.id!)}
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
                  placeholder="例如：2024 年度比赛"
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
                  选手名称（用逗号或换行分隔）
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
                <button className="btn btn-primary" onClick={handleCreateMatch}>
                  创建
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

