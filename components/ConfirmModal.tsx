import React from 'react';
import { Action } from '@/lib/actions';

interface ConfirmModalProps {
  actions: Action[];
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({ actions, onConfirm, onCancel }: ConfirmModalProps) {
  const getActionDescription = (action: Action): string => {
    switch (action.type) {
      case 'updateScore':
        return `更新分数：${action.contestant} - ${action.judge} = ${action.value ?? '空'}`;
      case 'addContestant':
        return `添加选手：${action.name}`;
      case 'updateContestantNumber':
        return `设置海选号：${action.contestant} = ${action.number}`;
      default:
        return '未知操作';
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">确认操作</h2>
          <button className="modal-close" onClick={onCancel}>×</button>
        </div>

        <div>
          {actions.length === 0 ? (
            <div style={{ 
              padding: '24px', 
              textAlign: 'center', 
              color: '#666',
              marginBottom: '24px'
            }}>
              <p style={{ marginBottom: '8px', fontSize: '18px' }}>没有检测到操作</p>
              <p style={{ fontSize: '14px', color: '#999' }}>请检查输入内容或重新描述</p>
            </div>
          ) : (
            <>
              <p style={{ marginBottom: '16px', color: '#666' }}>
                以下操作将被应用到评分表：
              </p>

              <div style={{
                background: '#f8f9fa',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '24px',
                maxHeight: '300px',
                overflowY: 'auto'
              }}>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {actions.map((action, index) => (
                    <li
                      key={index}
                      style={{
                        padding: '8px 0',
                        borderBottom: index < actions.length - 1 ? '1px solid #e0e0e0' : 'none'
                      }}
                    >
                      {getActionDescription(action)}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button className="btn btn-outline" onClick={onCancel}>
              {actions.length === 0 ? '关闭' : '取消'}
            </button>
            {actions.length > 0 && (
              <button className="btn btn-special" onClick={onConfirm}>
                确认应用
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

