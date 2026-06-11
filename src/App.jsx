import { useState } from "react";

const C = {
  cream: "#FAF3EA",
  apricot: "#F5EBE0",
  terra: "#C8845A",
  brown: "#3C2415",
  mid: "#8B5E3C",
  light: "#DEC9B0",
  pale: "#FDF8F2",
  red: "#C0392B",
};

const SYSTEM_PROMPT = `당신은 포근나루의 편집자입니다. 에세이 초안을 받아 흐름을 방해하는 문단·문장을 정리합니다.

역할:
- 문장 자체를 수정하지 않습니다
- 맥락에서 벗어난 문단·문장을 삭제하고
- 남은 문장들이 매끄럽게 이어지도록 재배치합니다

출력 형식 (반드시 이 형식으로만 응답):
===EDITED===
(편집된 글 전체)
===END===

===NOTES===
(편집 근거: 삭제한 내용과 이유, 2~4줄)
===END===

규칙:
- ===EDITED=== 와 ===END=== 사이에 편집된 글만 넣으세요
- ===NOTES=== 와 ===END=== 사이에 편집 근거만 넣으세요
- 다른 텍스트는 절대 추가하지 마세요
- 핵심 의도가 있으면 그것을 기준으로 편집하세요`;

function parseEditResponse(text) {
  const editedMatch = text.match(/===EDITED===([\s\S]*?)===END===/);
  const notesMatch = text.match(/===NOTES===([\s\S]*?)===END===/);
  if (!editedMatch) return null;
  return {
    edited: editedMatch[1].trim(),
    notes: notesMatch ? notesMatch[1].trim() : "",
  };
}

function Btn({ onClick, disabled, children, primary, style = {} }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "8px 18px",
        borderRadius: 7,
        border: primary ? "none" : `1px solid ${C.light}`,
        background: primary ? (disabled ? C.light : C.terra) : C.cream,
        color: primary ? "#fff" : disabled ? C.light : C.brown,
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 14,
        fontWeight: primary ? 600 : 400,
        fontFamily: "inherit",
        transition: "opacity 0.15s",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export default function App() {
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem("pognaru_api_key") || ""
  );
  const [keyInput, setKeyInput] = useState("");
  const [showKeySetup, setShowKeySetup] = useState(!localStorage.getItem("pognaru_api_key"));

  const [intent, setIntent] = useState("");
  const [draft, setDraft] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [guideOpen, setGuideOpen] = useState(true);

  const charCount = draft.replace(/\s/g, "").length;

  function saveApiKey() {
    if (!keyInput.trim().startsWith("sk-ant-")) {
      alert("올바른 Anthropic API 키를 입력해주세요 (sk-ant-로 시작)");
      return;
    }
    localStorage.setItem("pognaru_api_key", keyInput.trim());
    setApiKey(keyInput.trim());
    setShowKeySetup(false);
    setKeyInput("");
  }

  function clearApiKey() {
    if (window.confirm("저장된 API 키를 삭제할까요?")) {
      localStorage.removeItem("pognaru_api_key");
      setApiKey("");
      setShowKeySetup(true);
    }
  }

  async function handleEdit() {
    if (!draft.trim() || !apiKey) return;
    setLoading(true);
    setError("");
    setResult(null);

    const userMessage = intent.trim()
      ? `핵심 의도: ${intent.trim()}\n\n초안:\n${draft}`
      : `초안:\n${draft}`;

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-calls": "true",
        },
        body: JSON.stringify({
          model: "claude-opus-4-6",
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMessage }],
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        if (response.status === 401) throw new Error("API 키가 올바르지 않아요. 키를 다시 확인해주세요.");
        if (response.status === 429) throw new Error("요청이 너무 많아요. 잠시 후 다시 시도해주세요.");
        throw new Error(errData?.error?.message || `API 오류 (${response.status})`);
      }

      const data = await response.json();
      const textBlocks = (data.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      if (!textBlocks) throw new Error("API에서 텍스트 응답이 없어요. 잠시 후 다시 시도해주세요.");

      const parsed = parseEditResponse(textBlocks);
      if (!parsed) {
        throw new Error(`응답 형식을 인식하지 못했어요.\n\n미리보기:\n${textBlocks.slice(0, 300)}...`);
      }

      setResult(parsed);
    } catch (e) {
      setError(e.message || "알 수 없는 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!result?.edited) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(result.edited).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    } else {
      const ta = document.createElement("textarea");
      ta.value = result.edited;
      ta.style.cssText = "position:fixed;top:-9999px;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleReset() {
    setResult(null);
    setError("");
    setDraft("");
    setIntent("");
  }

  // ── API 키 설정 화면 ──
  if (showKeySetup) {
    return (
      <div style={{
        height: "100vh", background: C.cream, display: "flex",
        alignItems: "center", justifyContent: "center", fontFamily: "Georgia, 'Noto Serif KR', serif",
      }}>
        <div style={{
          width: "min(480px, 90vw)", background: C.pale, borderRadius: 12,
          border: `1px solid ${C.light}`, padding: "36px 32px", display: "flex",
          flexDirection: "column", gap: 18,
        }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.terra, marginBottom: 6 }}>
              ♦ 글 다듬기
            </div>
            <div style={{ fontSize: 13, color: C.mid, lineHeight: 1.8 }}>
              포근나루 편집 도구를 사용하려면<br />
              Anthropic API 키가 필요해요.
            </div>
          </div>

          <div style={{
            padding: "14px 16px", background: C.apricot, borderRadius: 8,
            fontSize: 12, color: C.mid, lineHeight: 1.9,
          }}>
            <strong style={{ color: C.terra }}>🔑 API 키 발급 방법</strong><br />
            1. <a href="https://console.anthropic.com" target="_blank" rel="noreferrer"
              style={{ color: C.terra }}>console.anthropic.com</a> 접속<br />
            2. 회원가입 / 로그인<br />
            3. API Keys → Create Key<br />
            4. 생성된 키 복사 (sk-ant-로 시작)<br />
            <br />
            <strong style={{ color: C.terra }}>🔒 보안 안내</strong><br />
            키는 이 브라우저에만 저장되며<br />외부로 전송되지 않아요.
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontSize: 13, color: C.mid }}>API 키 입력</label>
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveApiKey()}
              placeholder="sk-ant-..."
              style={{
                padding: "10px 12px", border: `1px solid ${C.light}`, borderRadius: 7,
                background: C.cream, color: C.brown, fontSize: 13,
                fontFamily: "monospace", outline: "none",
              }}
            />
            <Btn primary onClick={saveApiKey} style={{ padding: "10px" }}>
              저장하고 시작하기
            </Btn>
          </div>
        </div>
      </div>
    );
  }

  // ── 메인 편집기 화면 ──
  return (
    <div style={{
      height: "100vh", background: C.cream, color: C.brown,
      fontFamily: "Georgia, 'Noto Serif KR', serif",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "10px 16px", borderBottom: `1px solid ${C.light}`,
        background: C.apricot, display: "flex", alignItems: "center",
        gap: 10, flexShrink: 0,
      }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: C.terra }}>♦ 글 다듬기</span>
        <span style={{ fontSize: 12, color: C.mid, fontStyle: "italic", flex: 1 }}>
          흐름을 방해하는 문단을 걷어내고, 이야기를 다시 잇습니다
        </span>
        <button onClick={clearApiKey} style={{
          fontSize: 11, color: C.light, background: "none", border: "none",
          cursor: "pointer", fontFamily: "inherit",
        }}>🔑 키 변경</button>
        <span style={{
          padding: "2px 9px", borderRadius: 8, border: `1px solid ${C.light}`,
          fontSize: 11, color: C.mid, background: C.cream,
        }}>포근나루 × Claude</span>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>

        {/* Left: Input */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          overflow: "hidden", borderRight: `1px solid ${C.light}`,
        }}>
          {/* Guide toggle */}
          <div style={{ borderBottom: `1px solid ${C.light}`, flexShrink: 0 }}>
            <button onClick={() => setGuideOpen((v) => !v)} style={{
              width: "100%", padding: "8px 16px", background: C.pale,
              border: "none", cursor: "pointer", textAlign: "left",
              fontSize: 13, color: C.mid, fontFamily: "inherit",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span>📖 편집 가이드 / 참고 피드백</span>
              <span>{guideOpen ? "▲ 닫기" : "▼ 펼치기"}</span>
            </button>
            {guideOpen && (
              <div style={{
                padding: "10px 16px 12px", background: C.pale,
                fontSize: 12, color: C.mid, lineHeight: 1.8,
              }}>
                <strong style={{ color: C.terra }}>편집 원칙</strong><br />
                · 문장을 수정하지 않습니다<br />
                · 맥락에서 벗어난 문단·문장을 삭제하고<br />
                · 매끄럽게 이어지도록 재배치합니다<br /><br />
                <strong style={{ color: C.terra }}>잘 작동하는 경우</strong><br />
                · 글이 여러 방향으로 튀는 느낌이 들 때<br />
                · 핵심이 묻혀 있는 것 같을 때<br />
                · 분량을 줄이고 싶을 때
              </div>
            )}
          </div>

          {/* Intent input */}
          <div style={{
            padding: "10px 16px", borderBottom: `1px solid ${C.light}`, flexShrink: 0,
          }}>
            <label style={{ fontSize: 13, color: C.mid, display: "block", marginBottom: 5 }}>
              이 글에서 말하고 싶은 것 <span style={{ color: C.light }}>(선택)</span>
            </label>
            <input
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              placeholder="핵심을 한 문장으로 적어두면 더 정확하게 편집해요"
              style={{
                width: "100%", padding: "7px 10px", border: `1px solid ${C.light}`,
                borderRadius: 6, background: C.cream, color: C.brown,
                fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", outline: "none",
              }}
            />
          </div>

          {/* Draft textarea */}
          <div style={{
            flex: 1, display: "flex", flexDirection: "column",
            overflow: "hidden", padding: "10px 16px", gap: 8,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", flexShrink: 0 }}>
              <span style={{ fontSize: 13, color: C.mid }}>초안</span>
              <span style={{ fontSize: 12, color: C.light }}>{charCount}자</span>
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`에세이 초안을 여기에 붙여넣으세요.\n\n문장은 수정하지 않습니다.\n맥락에서 벗어난 문단·문장을 삭제하고,\n매끄럽게 이어지도록 재배치합니다.`}
              style={{
                flex: 1, padding: "12px", border: `1px solid ${C.light}`,
                borderRadius: 8, background: C.pale, color: C.brown,
                fontSize: 14, lineHeight: 2, fontFamily: "inherit",
                resize: "none", outline: "none",
              }}
            />
          </div>

          {/* Edit button */}
          <div style={{
            padding: "10px 16px", borderTop: `1px solid ${C.light}`,
            background: C.apricot, flexShrink: 0,
          }}>
            <Btn primary disabled={loading || !draft.trim()} onClick={handleEdit}
              style={{ width: "100%", padding: "10px" }}>
              {loading ? "✦ 편집 중..." : "편집하기"}
            </Btn>
          </div>
        </div>

        {/* Right: Result */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {error ? (
            <div style={{ flex: 1, padding: "20px", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{
                background: "#FDF3F3", border: `1px solid #F5C6C6`,
                borderRadius: 8, padding: "14px 16px", fontSize: 13,
                color: C.red, lineHeight: 1.8, whiteSpace: "pre-wrap",
              }}>
                <strong>편집 중 문제가 발생했어요</strong><br />{error}
              </div>
              <div style={{
                fontSize: 12, color: C.mid, lineHeight: 1.8,
                padding: "10px 12px", background: C.pale, borderRadius: 6,
              }}>
                <strong style={{ color: C.terra }}>💡 해결 방법</strong><br />
                · 잠시 후 다시 시도해주세요<br />
                · 글이 너무 길면 단락을 나눠서 시도해보세요<br />
                · API 키 오류라면 🔑 키 변경으로 재입력해주세요
              </div>
              <Btn onClick={handleReset}>처음부터 다시</Btn>
            </div>
          ) : result ? (
            <>
              <div style={{
                flex: 1, overflow: "auto", padding: "16px",
                display: "flex", flexDirection: "column", gap: 12,
              }}>
                <div style={{
                  fontSize: 13, color: C.mid, display: "flex",
                  justifyContent: "space-between", alignItems: "center", flexShrink: 0,
                }}>
                  <span>편집 결과</span>
                  <span style={{ fontSize: 12, color: C.light }}>
                    {result.edited.replace(/\s/g, "").length}자 →{" "}
                    <span style={{ color: C.terra }}>
                      {charCount > 0 ? Math.round((result.edited.replace(/\s/g, "").length / charCount) * 100) : 0}%
                    </span>
                  </span>
                </div>
                <div style={{
                  flex: 1, padding: "16px", background: C.pale, borderRadius: 8,
                  border: `1px solid ${C.light}`, fontSize: 14, lineHeight: 2.2,
                  color: C.brown, whiteSpace: "pre-wrap", overflow: "auto",
                }}>
                  {result.edited}
                </div>
                {result.notes && (
                  <div style={{
                    padding: "12px 14px", background: C.apricot, borderRadius: 7,
                    fontSize: 13, color: C.mid, lineHeight: 1.9, flexShrink: 0,
                  }}>
                    <strong style={{ color: C.terra, display: "block", marginBottom: 4 }}>
                      ✦ 편집 근거
                    </strong>
                    {result.notes}
                  </div>
                )}
              </div>
              <div style={{
                padding: "10px 16px", borderTop: `1px solid ${C.light}`,
                background: C.apricot, display: "flex", gap: 8, flexShrink: 0,
              }}>
                <Btn primary onClick={handleCopy} style={{ flex: 1, padding: "9px" }}>
                  {copied ? "✓ 복사됨" : "📋 복사하기"}
                </Btn>
                <Btn onClick={handleReset} style={{ flex: 1, padding: "9px" }}>다시 편집</Btn>
              </div>
            </>
          ) : (
            <div style={{
              flex: 1, display: "flex", alignItems: "center",
              justifyContent: "center", flexDirection: "column", gap: 10, color: C.light,
            }}>
              {loading ? (
                <>
                  <div style={{
                    width: 32, height: 32, border: `3px solid ${C.light}`,
                    borderTopColor: C.terra, borderRadius: "50%",
                    animation: "spin 1s linear infinite",
                  }} />
                  <span style={{ fontSize: 13, color: C.mid }}>편집 중...</span>
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </>
              ) : (
                <span style={{ fontSize: 14, fontStyle: "italic" }}>편집 결과가 여기에 나타납니다</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
