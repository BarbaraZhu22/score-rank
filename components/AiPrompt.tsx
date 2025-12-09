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
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTips, setShowTips] = useState(false);

  const handleTextSubmit = async () => {
    if (!textInput.trim()) {
      setError('请输入指令');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const actions = await generateActions(textInput, matchData);
      if (!actions || actions.length === 0) {
        setError('没有检测到操作，请检查输入内容或重新描述');
      } else {
        onActionsGenerated(actions);
      }
      // Don't clear textInput here - keep it so user can modify if they cancel
    } catch (err: any) {
      setError(err.message || '生成操作失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsOcrLoading(true);
    setError(null);

    try {
      // Run OCR on the image - only put text in input box, don't generate actions
      const ocrText = await runOCR(file);
      if (ocrText && ocrText.trim()) {
        setTextInput(ocrText);
      } else {
        setError('图片识别失败，未能提取到文字内容');
      }
    } catch (err: any) {
      setError(err.message || 'OCR 识别失败，请重试');
      // Don't save anything if OCR fails
    } finally {
      setIsOcrLoading(false);
      // Reset file input so same file can be selected again
      e.target.value = '';
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
          <div style={{ 
            marginBottom: '0.875rem', 
            padding: '0.625rem', 
            background: '#e7f3ff', 
            borderRadius: '0.5rem',
            border: '1px solid #b3d9ff'
          }}>
            <div 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                cursor: 'pointer',
                marginBottom: showTips ? '0.625rem' : '0'
              }}
              onClick={() => setShowTips(!showTips)}
            >
              <span style={{ fontWeight: 600, color: '#0066cc', fontSize: '0.75rem' }}>
                💡 如何整理图片信息以便 AI 识别？
              </span>
              <span style={{ color: '#0066cc', fontSize: '1rem', transition: 'transform 0.3s', transform: showTips ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                ▼
              </span>
            </div>
            {showTips && (
              <div style={{ fontSize: '0.6875rem', color: '#333', lineHeight: '1.6' }}>
                <p style={{ marginBottom: '0.4375rem', fontWeight: 600 }}>使用其他 AI 工具（如 ChatGPT、Claude 等）识别图片时，可以使用以下提示词：</p>
                <div style={{ 
                  background: 'white', 
                  padding: '0.625rem', 
                  borderRadius: '0.375rem', 
                  marginBottom: '0.4375rem',
                  border: '1px solid #ddd'
                }}>
                  <p style={{ marginBottom: '0.3125rem', fontWeight: 600 }}>提示词模板：</p>
                  <pre style={{ 
                    whiteSpace: 'pre-wrap', 
                    wordBreak: 'break-word',
                    fontSize: '0.625rem',
                    lineHeight: '1.5',
                    margin: 0,
                    color: '#0066cc'
                  }}>
{`请识别这张图片中的表格数据，并按以下格式输出：

格式要求：
1. 如果有序号/海选号，格式：序号 选手名
   例如：001 张三

2. 如果有分数，格式：序号 选手名 裁判名 分数
   例如：001 张三 Judge A 8.8

3. 每行一个条目，用换行分隔
4. 只输出数据，不要添加其他说明文字

请开始识别：`}
                  </pre>
                </div>
                <p style={{ margin: 0, fontSize: '0.625rem', color: '#666' }}>
                  将 AI 识别后的文本复制粘贴到下方输入框即可
                </p>
              </div>
            )}
          </div>

          <div style={{ marginBottom: '0.875rem' }}>
            <label style={{ display: 'block', marginBottom: '0.4375rem', fontWeight: 600 }}>
              输入文字指令
            </label>
            <textarea
              className="input"
              rows={6}
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              placeholder="例如：请帮我加这些选手，这是名单..."
              disabled={isOcrLoading}
            />
          </div>

          {error && (
            <div style={{
              padding: '0.625rem',
              background: '#f8d7da',
              color: '#721c24',
              borderRadius: '0.5rem',
              marginBottom: '0.875rem'
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.625rem', justifyContent: 'flex-end' }}>
            <button className="btn btn-outline" onClick={onClose} disabled={isLoading || isOcrLoading}>
              取消
            </button>
            <button
              className="btn btn-special"
              onClick={handleTextSubmit}
              disabled={isLoading || isOcrLoading || !textInput.trim()}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.4375rem', 
                justifyContent: 'center',
                minWidth: '7.875rem',
                position: 'relative'
              }}
            >
              <span 
                className="loading" 
                style={{ 
                  margin: 0, 
                  width: '0.875rem', 
                  height: '0.875rem',
                  borderWidth: '0.125rem',
                  flexShrink: 0,
                  opacity: isLoading ? 1 : 0,
                  visibility: isLoading ? 'visible' : 'hidden',
                  transition: 'opacity 0.2s ease, visibility 0.2s ease',
                  position: isLoading ? 'static' : 'absolute'
                }}
              ></span>
              <span style={{ 
                opacity: isLoading ? 0.9 : 1,
                transition: 'opacity 0.2s ease'
              }}>
                {isLoading ? '处理中...' : '发送给 AI'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

