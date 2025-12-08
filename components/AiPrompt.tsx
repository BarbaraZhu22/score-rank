import React, { useState } from 'react';
import { Action } from '@/lib/actions';
import { generateActions } from '@/lib/ai';
import { runOCR } from '@/lib/ocr';

interface AiPromptProps {
  matchData: any;
  onActionsGenerated: (actions: Action[]) => void;
  onClose: () => void;
}

export default function AiPrompt({ matchData, onActionsGenerated, onClose }: AiPromptProps) {
  const [textInput, setTextInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTextSubmit = async () => {
    if (!textInput.trim()) {
      setError('请输入指令或上传图片');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const actions = await generateActions(textInput, matchData);
      onActionsGenerated(actions);
      setTextInput('');
    } catch (err: any) {
      setError(err.message || '生成操作失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setError(null);

    try {
      // Run OCR on the image
      const ocrText = await runOCR(file);
      setTextInput(ocrText);

      // Generate actions from OCR text
      const actions = await generateActions(ocrText, matchData);
      onActionsGenerated(actions);
    } catch (err: any) {
      setError(err.message || 'OCR 识别或生成操作失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">AI 助手</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
              上传图片（OCR 识别）
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              disabled={isLoading}
              style={{ width: '100%', padding: '8px' }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
              或输入文字指令
            </label>
            <textarea
              className="input"
              rows={6}
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              placeholder="例如：&#10;张三 Judge A 8.8&#10;李四 Judge B 9.2&#10;添加选手 王五"
              disabled={isLoading}
            />
          </div>

          {error && (
            <div style={{
              padding: '12px',
              background: '#f8d7da',
              color: '#721c24',
              borderRadius: '8px',
              marginBottom: '16px'
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button className="btn btn-outline" onClick={onClose} disabled={isLoading}>
              取消
            </button>
            <button
              className="btn btn-special"
              onClick={handleTextSubmit}
              disabled={isLoading || !textInput.trim()}
            >
              {isLoading ? '处理中...' : '发送给 AI'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

