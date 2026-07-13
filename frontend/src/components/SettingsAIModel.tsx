import { useState } from "react";
import { Input, Select, Button, Typography, message, Tag } from "antd";
import { Save, Eye, EyeOff, AlertCircle, Zap, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { updateCharacter, testConnection } from "../api";
import type { Character } from "../api";

const { Text } = Typography;

interface Props {
  character: Character;
  onUpdated: (char: Character) => void;
}

// 服务商预设：推荐模型 + 申请地址
const PROVIDER_PRESETS: Record<string, { models: string[]; applyUrl: string; applyLabel: string; defaultModel: string }> = {
  deepseek: {
    models: ["deepseek-chat", "deepseek-v4-flash"],
    applyUrl: "https://platform.deepseek.com/api-keys",
    applyLabel: "DeepSeek 开放平台",
    defaultModel: "deepseek-chat",
  },
  openai: {
    models: ["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"],
    applyUrl: "https://platform.openai.com/api-keys",
    applyLabel: "OpenAI 平台",
    defaultModel: "gpt-4o-mini",
  },
  custom: {
    models: [],
    applyUrl: "",
    applyLabel: "",
    defaultModel: "",
  },
};

export default function SettingsAIModel({ character, onUpdated }: Props) {
  const [provider, setProvider] = useState((character as any).apiProvider || "deepseek");
  const [apiKey, setApiKey] = useState((character as any).apiKey || "");
  const [apiModel, setApiModel] = useState((character as any).apiModel || "");
  const [apiUrl, setApiUrl] = useState((character as any).apiUrl || "");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [keyError, setKeyError] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; latency?: number; error?: string } | null>(null);

  const usingEnv = !apiKey.trim();
  const preset = PROVIDER_PRESETS[provider] || PROVIDER_PRESETS.custom;

  const handleProviderChange = (v: string) => {
    setProvider(v);
    setTestResult(null);
    // 切换服务商时，若模型名为空则填入推荐默认
    if (!apiModel.trim() && PROVIDER_PRESETS[v]?.defaultModel) {
      setApiModel(PROVIDER_PRESETS[v].defaultModel);
    }
  };

  const handleSave = async () => {
    if (provider === "custom" && !apiUrl.trim()) {
      message.warning("自定义模式下请填写 API 地址");
      return;
    }
    if (apiKey.trim() && !apiKey.trim().startsWith("sk-") && provider === "deepseek") {
      setKeyError("DeepSeek API Key 通常以 sk- 开头，请检查");
      return;
    }
    setSaving(true);
    setKeyError("");
    try {
      const updated = await updateCharacter(character.id, {
        apiProvider: provider,
        apiKey: apiKey.trim(),
        apiModel: apiModel.trim(),
        apiUrl: apiUrl.trim(),
      } as any);
      onUpdated(updated);
      message.success("AI 配置已保存");
    } catch {
      message.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (provider === "custom" && !apiUrl.trim()) {
      message.warning("请先填写 API 地址");
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testConnection({
        provider,
        apiKey: apiKey.trim(),
        apiModel: apiModel.trim(),
        apiUrl: apiUrl.trim(),
      });
      setTestResult(result);
    } catch {
      setTestResult({ ok: false, error: "测试请求失败" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="settings-section">
      <h2 className="settings-section-title">AI 模型配置</h2>

      {/* 连接状态卡片 */}
      <div className="settings-connection-card">
        <div className={`settings-connection-dot${usingEnv ? " env" : ""}`} />
        <div style={{ flex: 1 }}>
          <Text strong style={{ fontSize: 14 }}>
            {provider === "deepseek" ? "DeepSeek" : provider === "openai" ? "OpenAI" : "自定义服务"}
            {" · "}
            {apiModel.trim() || preset.defaultModel || "未指定模型"}
          </Text>
          <Text type="secondary" style={{ fontSize: 12, display: "block" }}>
            {usingEnv ? "使用全局 .env 配置（所有角色共享）" : "使用角色独立配置"}
          </Text>
        </div>
      </div>

      {/* 配置表单 */}
      <div className="settings-subsection">
        <h3 className="settings-subsection-title">连接配置</h3>

        <div className="ai-hint-box">
          <Text style={{ fontSize: 13 }}>
            💡 不填 API Key 则使用 <code>.env</code> 全局配置。填写后此角色使用独立配置，互不影响。
          </Text>
        </div>

        <div className="settings-field">
          <label className="settings-field-label">服务商</label>
          <Select
            value={provider}
            onChange={handleProviderChange}
            style={{ width: "100%" }}
            options={[
              { label: "DeepSeek", value: "deepseek" },
              { label: "OpenAI", value: "openai" },
              { label: "自定义（兼容 OpenAI 格式）", value: "custom" },
            ]}
          />
          {preset.applyUrl && (
            <a
              className="ai-apply-link"
              href={preset.applyUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink size={12} /> 去 {preset.applyLabel} 申请 API Key
            </a>
          )}
        </div>

        <div className="settings-field">
          <label className="settings-field-label">API Key</label>
          <Input
            value={apiKey}
            onChange={(e) => { setApiKey(e.target.value); setKeyError(""); setTestResult(null); }}
            placeholder={usingEnv ? "留空使用 .env 全局 Key" : "sk-..."}
            type={showKey ? "text" : "password"}
            status={keyError ? "error" : undefined}
            suffix={
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                {keyError && <AlertCircle size={14} color="var(--color-accent-danger)" />}
                <Button type="text" size="small" onClick={() => setShowKey(!showKey)} style={{ padding: 0 }}>
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </Button>
              </div>
            }
          />
          {keyError && <Text type="danger" style={{ fontSize: 12 }}>{keyError}</Text>}
        </div>

        <div className="settings-field">
          <label className="settings-field-label">模型名称</label>
          <Input
            value={apiModel}
            onChange={(e) => { setApiModel(e.target.value); setTestResult(null); }}
            placeholder={preset.defaultModel || "模型名"}
          />
          {preset.models.length > 0 && (
            <div className="ai-model-quick">
              {preset.models.map((m) => (
                <Tag
                  key={m}
                  className="ai-model-tag"
                  onClick={() => { setApiModel(m); setTestResult(null); }}
                >
                  {m}
                </Tag>
              ))}
            </div>
          )}
        </div>

        {provider === "custom" && (
          <div className="settings-field">
            <label className="settings-field-label">API 地址 <Text type="danger" style={{ fontSize: 11 }}>*</Text></label>
            <Input
              value={apiUrl}
              onChange={(e) => { setApiUrl(e.target.value); setTestResult(null); }}
              placeholder="https://your-api.com/v1/chat/completions"
            />
          </div>
        )}
      </div>

      {/* 测试连接 */}
      <div className="settings-subsection">
        <h3 className="settings-subsection-title">连接测试</h3>
        <div className="ai-test-row">
          <Button
            icon={<Zap size={14} />}
            onClick={handleTest}
            loading={testing}
          >
            {testing ? "测试中…" : "测试连接"}
          </Button>
          {testResult && (
            <div className={`ai-test-result${testResult.ok ? " ok" : " fail"}`}>
              {testResult.ok ? (
                <>
                  <CheckCircle2 size={15} />
                  <span>连接成功 · 延迟 {testResult.latency}ms</span>
                </>
              ) : (
                <>
                  <XCircle size={15} />
                  <span>失败：{testResult.error}</span>
                </>
              )}
            </div>
          )}
        </div>
        <Text type="secondary" style={{ fontSize: 12, marginTop: 6, display: "block" }}>
          发送一条测试消息验证配置是否可用，{usingEnv ? "当前测试的是 .env 全局配置" : "当前测试的是上方填写的配置"}
        </Text>
      </div>

      <Button
        type="primary"
        icon={<Save size={14} />}
        loading={saving}
        onClick={handleSave}
        size="large"
      >
        保存
      </Button>
    </div>
  );
}
