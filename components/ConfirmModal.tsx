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
              padding: '1.125rem', 
              textAlign: 'center', 
              color: '#666',
              marginBottom: '1.125rem'
            }}>
              <p style={{ marginBottom: '0.4375rem', fontSize: '0.875rem' }}>没有检测到操作</p>
              <p style={{ fontSize: '0.6875rem', color: '#999' }}>请检查输入内容或重新描述</p>
            </div>
          ) : (
            <>
              <p style={{ marginBottom: '0.625rem', color: '#666', fontSize: '0.75rem' }}>
                以下操作将被应用到评分表：
              </p>

              <div style={{
                background: '#f8f9fa',
                borderRadius: '0.5rem',
                padding: '0.625rem',
                marginBottom: '1.125rem',
                maxHeight: '22.5rem',
                overflowY: 'auto'
              }}>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {actions.map((action, index) => (
                    <li
                      key={index}
                      style={{
                        padding: '0.3125rem 0',
                        borderBottom: index < actions.length - 1 ? '1px solid #e0e0e0' : 'none',
                        fontSize: '0.6875rem',
                        lineHeight: '1.4'
                      }}
                    >
                      {getActionDescription(action)}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: '0.625rem', justifyContent: 'flex-end' }}>
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

