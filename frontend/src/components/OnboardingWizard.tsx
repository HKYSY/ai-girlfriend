import { useState, useEffect } from "react";
import { Input, Select, Button, Typography, message, Tag } from "antd";
import {
  Eye, EyeOff, Zap, CheckCircle2, XCircle, ExternalLink,
  ArrowRight, ArrowLeft, Heart, User, Palette, Cpu, Sparkles,
} from "lucide-react";
import {
  updateCharacter, testConnection, getPresetModels, getModels,
} from "../api";
import type { Character, PresetModel, Live2DModelInfo } from "../api";

const { Text } = Typography;

interface Props {
  character: Character;
  onComplete: (char: Character) => void;
}

const PROVIDER_PRESETS: Record<string, { models: string[]; applyUrl: string; defaultModel: string }> = {
  deepseek: {
    models: ["deepseek-chat", "deepseek-v4-flash"],
    applyUrl: "https://platform.deepseek.com/api-keys",
    defaultModel: "deepseek-v4-flash",
  },
  openai: {
    models: ["gpt-4o", "gpt-4o-mini"],
    applyUrl: "https://platform.openai.com/api-keys",
    defaultModel: "gpt-4o-mini",
  },
  custom: { models: [], applyUrl: "", defaultModel: "" },
};

const STEPS = [
  { title: "AI 配置", icon: Cpu, desc: "连接你的 AI 大脑" },
  { title: "角色", icon: User, desc: "给她一个身份" },
  { title: "形象", icon: Palette, desc: "选择她的样子" },
  { title: "完成", icon: Heart, desc: "准备开始" },
];

export default function OnboardingWizard({ character, onComplete }: Props) {
  const [step, setStep] = useState(0);

  // Step 0: API 配置
  const [provider, setProvider] = useState(character.apiProvider || "deepseek");
  const [apiKey, setApiKey] = useState(character.apiKey || "");
  const [apiModel, setApiModel] = useState(character.apiModel || "");
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; latency?: number; error?: string } | null>(null);
  const [apiSaved, setApiSaved] = useState(false);

  // Step 1: 角色设置
  const [name, setName] = useState(character.name || "玉子");
  const [template, setTemplate] = useState(character.personalityTemplate || "yuko");

  // Step 2: 形象选择
  const [presetModels, setPresetModels] = useState<PresetModel[]>([]);
  const [userModels, setUserModels] = useState<Live2DModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState(character.modelUrl || "/live2d/icegirl/IceGirl.model3.json");

  const preset = PROVIDER_PRESETS[provider] || PROVIDER_PRESETS.custom;

  useEffect(() => {
    getPresetModels().then(setPresetModels).catch(() => {});
    getModels().then(setUserModels).catch(() => {});
  }, []);

  // ===== Step 0: 保存 API 配置 =====
  const saveApiConfig = async (): Promise<boolean> => {
    try {
      const updated = await updateCharacter(character.id, {
        apiProvider: provider,
        apiKey: apiKey.trim(),
        apiModel: apiModel.trim() || preset.defaultModel,
        apiUrl: "",
      } as any);
      setApiSaved(true);
      message.success("AI 配置已保存");
      // 不立即调用 onComplete，等全部步骤完成
      return true;
    } catch {
      message.error("保存失败");
      return false;
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testConnection({
        provider,
        apiKey: apiKey.trim(),
        apiModel: apiModel.trim() || preset.defaultModel,
        apiUrl: "",
      });
      setTestResult(result);
    } catch {
      setTestResult({ ok: false, error: "测试请求失败" });
    } finally {
      setTesting(false);
    }
  };

  // ===== Step 1: 保存角色信息 =====
  const saveRole = async (): Promise<boolean> => {
    const trimmed = name.trim();
    if (!trimmed) {
      message.warning("请给她起个名字");
      return false;
    }
    try {
      await updateCharacter(character.id, {
        name: trimmed,
        personalityTemplate: template,
      } as any);
      message.success("角色信息已保存");
      return true;
    } catch {
      message.error("保存失败");
      return false;
    }
  };

  // ===== Step 2: 保存形象 =====
  const saveAppearance = async (): Promise<boolean> => {
    try {
      await updateCharacter(character.id, { modelUrl: selectedModel } as any);
      return true;
    } catch {
      return false;
    }
  };

  // ===== 导航 =====
  const handleNext = async () => {
    if (step === 0) {
      // API 步骤：必须填 Key 或使用 .env
      const ok = await saveApiConfig();
      if (!ok) return;
    } else if (step === 1) {
      const ok = await saveRole();
      if (!ok) return;
    } else if (step === 2) {
      await saveAppearance();
    } else if (step === 3) {
      // 完成
      localStorage.setItem("onboarding-completed", "true");
      // 重新获取角色信息
      try {
        const updated = await updateCharacter(character.id, {} as any);
        onComplete(updated);
      } catch {
        onComplete(character);
      }
      return;
    }
    setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleSkip = () => {
    // 跳过当前步骤（仅 step 1 和 2 可跳过）
    if (step === 1 || step === 2) {
      setStep(step + 1);
    }
  };

  const canSkip = step === 1 || step === 2;
  const isLastStep = step === 3;
  const currentStepInfo = STEPS[step];

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-container">
        {/* 顶部进度 */}
        <div className="onboarding-progress">
          {STEPS.map((s, i) => (
            <div
              key={i}
              className={`onboarding-step-dot${i === step ? " active" : ""}${i < step ? " done" : ""}`}
            >
              <s.icon size={16} />
              <span>{s.title}</span>
            </div>
          ))}
        </div>

        {/* 内容区 */}
        <div className="onboarding-content">
          <div className="onboarding-step-header">
            <h2>{currentStepInfo.title}</h2>
            <p>{currentStepInfo.desc}</p>
          </div>

          {/* Step 0: API 配置 */}
          {step === 0 && (
            <div className="onboarding-step-body">
              <div className="onboarding-field">
                <label className="onboarding-label">服务商</label>
                <Select
                  value={provider}
                  onChange={(v) => { setProvider(v); setTestResult(null); if (!apiModel && PROVIDER_PRESETS[v]?.defaultModel) setApiModel(PROVIDER_PRESETS[v].defaultModel); }}
                  style={{ width: "100%" }}
                  options={[
                    { label: "DeepSeek", value: "deepseek" },
                    { label: "OpenAI", value: "openai" },
                    { label: "自定义（兼容 OpenAI 格式）", value: "custom" },
                  ]}
                />
                {preset.applyUrl && (
                  <a className="onboarding-link" href={preset.applyUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink size={12} /> 前往申请 API Key
                  </a>
                )}
              </div>

              <div className="onboarding-field">
                <label className="onboarding-label">API Key</label>
                <Input
                  value={apiKey}
                  onChange={(e) => { setApiKey(e.target.value); setTestResult(null); }}
                  placeholder="sk-..."
                  type={showKey ? "text" : "password"}
                  suffix={
                    <Button type="text" size="small" onClick={() => setShowKey(!showKey)} style={{ padding: 0 }}>
                      {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </Button>
                  }
                />
                <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: "block" }}>
                  不填则使用 .env 全局配置（如果已配置）
                </Text>
              </div>

              <div className="onboarding-field">
                <label className="onboarding-label">模型</label>
                <Input
                  value={apiModel}
                  onChange={(e) => { setApiModel(e.target.value); setTestResult(null); }}
                  placeholder={preset.defaultModel || "模型名"}
                />
                {preset.models.length > 0 && (
                  <div className="onboarding-tags">
                    {preset.models.map((m) => (
                      <Tag key={m} className="onboarding-tag" onClick={() => { setApiModel(m); setTestResult(null); }}>
                        {m}
                      </Tag>
                    ))}
                  </div>
                )}
              </div>

              <div className="onboarding-test">
                <Button icon={<Zap size={14} />} onClick={handleTest} loading={testing}>
                  {testing ? "测试中…" : "测试连接"}
                </Button>
                {testResult && (
                  <div className={`onboarding-test-result${testResult.ok ? " ok" : " fail"}`}>
                    {testResult.ok ? (
                      <><CheckCircle2 size={15} /><span>连接成功 · {testResult.latency}ms</span></>
                    ) : (
                      <><XCircle size={15} /><span>{testResult.error}</span></>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 1: 角色设置 */}
          {step === 1 && (
            <div className="onboarding-step-body">
              <div className="onboarding-field">
                <label className="onboarding-label">她的名字</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="给她起个名字"
                  maxLength={20}
                  size="large"
                />
              </div>

              <div className="onboarding-field">
                <label className="onboarding-label">性格模板</label>
                <Select
                  value={template}
                  onChange={setTemplate}
                  style={{ width: "100%" }}
                  options={[
                    { label: "玉子（默认）", value: "yuko" },
                    { label: "自定义", value: "custom" },
                  ]}
                />
                <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: "block" }}>
                  选择"玉子"使用预设性格；选择"自定义"可在设置中详细设计
                </Text>
              </div>
            </div>
          )}

          {/* Step 2: 形象选择 */}
          {step === 2 && (
            <div className="onboarding-step-body">
              <div className="onboarding-model-grid">
                {presetModels.map((m) => (
                  <button
                    key={m.id}
                    className={`onboarding-model-card${selectedModel === m.modelUrl ? " selected" : ""}`}
                    onClick={() => setSelectedModel(m.modelUrl)}
                    type="button"
                  >
                    <div className="onboarding-model-preview">
                      <img src={m.modelUrl.replace(".model3.json", "/icon.jpg")} alt={m.name} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    </div>
                    <span>{m.name}</span>
                  </button>
                ))}
                {userModels.map((m) => (
                  <button
                    key={m.id}
                    className={`onboarding-model-card${selectedModel === m.modelUrl ? " selected" : ""}`}
                    onClick={() => setSelectedModel(m.modelUrl)}
                    type="button"
                  >
                    <div className="onboarding-model-preview">
                      <img src={m.modelUrl.replace(/\/[^/]+\.model3\.json$/, "/icon.jpg")} alt={m.name} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    </div>
                    <span>{m.name}</span>
                  </button>
                ))}
              </div>
              <Text type="secondary" style={{ fontSize: 12, marginTop: 8, display: "block" }}>
                可以后续在设置中上传更多模型
              </Text>
            </div>
          )}

          {/* Step 3: 完成 */}
          {step === 3 && (
            <div className="onboarding-step-body onboarding-done">
              <div className="onboarding-done-icon">
                <Sparkles size={48} />
              </div>
              <h3>一切就绪！</h3>
              <p>
                {name.trim() || "玉子"} 已经准备好和你聊天了。
                <br />
                后续可以在右上角 ⚙ 设置中调整所有配置。
              </p>
              {testResult?.ok && (
                <div className="onboarding-done-badge">
                  <CheckCircle2 size={16} /> API 连接正常
                </div>
              )}
            </div>
          )}
        </div>

        {/* 底部导航 */}
        <div className="onboarding-nav">
          {step > 0 && (
            <Button onClick={handleBack} icon={<ArrowLeft size={14} />} type="text">
              上一步
            </Button>
          )}
          <div style={{ flex: 1 }} />
          {canSkip && (
            <Button onClick={handleSkip} type="text" style={{ marginRight: 8 }}>
              跳过
            </Button>
          )}
          <Button
            type="primary"
            onClick={handleNext}
            icon={isLastStep ? <Heart size={14} /> : <ArrowRight size={14} />}
            iconPosition="end"
            size="large"
          >
            {isLastStep ? "开始聊天" : "下一步"}
          </Button>
        </div>
      </div>
    </div>
  );
}
