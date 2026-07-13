import { useState, useRef } from "react";
import { Input, Select, Typography, Button, message, Card, Modal } from "antd";
import { Save, AlertCircle, Sparkles, Trash2, Wand2, Camera } from "lucide-react";
import { updateCharacter, uploadAvatar } from "../api";
import type { Character } from "../api";

const { Text } = Typography;

interface Props {
  character: Character;
  onUpdated: (char: Character) => void;
}

const TEMPLATE_OPTIONS = [
  { label: "玉子", value: "yuko" },
  { label: "自定义", value: "custom" },
];

// ========== 自定义性格结构化设计 ==========
interface CustomProfile {
  background: string;
  personality: string;
  likes: string;
  chatStyle: string;
  catchphrase: string;
  quirks: string;
  taboos: string;
  flaws: string;
}

const EMPTY_PROFILE: CustomProfile = {
  background: "", personality: "", likes: "", chatStyle: "",
  catchphrase: "", quirks: "", taboos: "", flaws: "",
};

const PROFILE_FIELDS: { key: keyof CustomProfile; label: string; placeholder: string; rows: number; tip?: string }[] = [
  { key: "background", label: "背景故事", rows: 4, tip: "她是谁、你们怎么认识的", placeholder: "年龄、职业、和用户怎么认识的、现在的关系阶段……" },
  { key: "personality", label: "性格底色", rows: 4, tip: "用行为倾向而非形容词", placeholder: "如：嘴上嫌弃但会偷偷关注对方的朋友圈；占有欲强但嘴硬不承认" },
  { key: "likes", label: "喜好", rows: 4, placeholder: "饮料、动漫、游戏、音乐、爱好、喜欢的角色类型……" },
  { key: "chatStyle", label: "聊天习惯", rows: 3, placeholder: "打字风格、发消息的习惯、语气特点……" },
  { key: "catchphrase", label: "口头禅与句式", rows: 3, placeholder: "常用的口头禅、句尾习惯、颜文字……" },
  { key: "quirks", label: "小怪癖", rows: 3, placeholder: "让她更真实可爱的小习惯……" },
  { key: "taboos", label: "忌讳 / 雷区", rows: 3, placeholder: "说到什么会炸毛、什么不能碰……" },
  { key: "flaws", label: "缺点", rows: 3, tip: "真实感的核心", placeholder: "爱吃醋、小脾气、有点懒、记仇……" },
];

// 序列化为结构化文本（用【】分节，可往返解析）
function serializeProfile(p: CustomProfile): string {
  const sections: [string, string][] = [
    ["背景故事", p.background],
    ["性格底色", p.personality],
    ["喜好", p.likes],
    ["聊天习惯", p.chatStyle],
    ["口头禅与句式", p.catchphrase],
    ["小怪癖", p.quirks],
    ["忌讳", p.taboos],
    ["缺点", p.flaws],
  ];
  return sections
    .filter(([, v]) => v.trim())
    .map(([k, v]) => `【${k}】\n${v.trim()}`)
    .join("\n\n");
}

// 从文本解析回结构化（兼容旧自由文本）
function parseProfile(text: string): CustomProfile {
  if (!text || !text.trim()) return { ...EMPTY_PROFILE };
  if (!text.includes("【")) {
    return { ...EMPTY_PROFILE, background: text };
  }
  const map: Record<string, string> = {};
  const regex = /【([^】]+)】\n?([\s\S]*?)(?=\n【[^】]+】|$)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    map[m[1].trim()] = m[2].trim();
  }
  return {
    background: map["背景故事"] || "",
    personality: map["性格底色"] || "",
    likes: map["喜好"] || "",
    chatStyle: map["聊天习惯"] || "",
    catchphrase: map["口头禅与句式"] || "",
    quirks: map["小怪癖"] || "",
    taboos: map["忌讳"] || "",
    flaws: map["缺点"] || "",
  };
}

// 预设角色模板（具体到细节，套用后可继续修改）
const PROFILE_PRESETS: { name: string; emoji: string; desc: string; profile: CustomProfile }[] = [
  {
    name: "温柔学姐",
    emoji: "🌷",
    desc: "温柔体贴，成熟包容",
    profile: {
      background: "23岁，研一在读，和用户在图书馆认识。你比他大两届，平时像姐姐一样照顾他，但心里其实很依赖他。你们已经暧昧半年，还没正式在一起。",
      personality: "温柔但不软弱，有自己的原则\n嘴上说着“弟弟要听话”，其实什么都依他\n会记住他随口说的小事，过几天突然兑现\n吃醋了不会吵，只会安静地不理人",
      likes: "饮料：热可可、桂花拿铁\n爱好：看书、烘焙、养多肉\n音乐：轻音乐、落日飞车\n喜欢被摸头、喜欢被叫名字",
      chatStyle: "打字温柔有条理，很少发错别字\n会发长长的关心\n撒娇时语气软软的，用“嗯～”\n晚安前会发一句“早点睡，别熬夜了”",
      catchphrase: "“嗯～”——撒娇或答应\n“乖”——哄他的时候\n“你呀”——无奈又宠溺\n句尾常带“呀”“呢”",
      quirks: "看到好看的多肉会拍照发给他\n烘焙失败会委屈地求安慰\n记日记，会偷偷写关于他的事",
      taboos: "被说“老”或“阿姨”\n被拿和他前女友比较\n被无视关心",
      flaws: "有点爱操心，管太多让他烦\n占有欲强但嘴硬不承认\n生气时会冷战，等他来哄",
    },
  },
  {
    name: "傲娇青梅",
    emoji: "🎋",
    desc: "嘴硬心软，青梅竹马",
    profile: {
      background: "20岁，大二，和用户从小一起长大的青梅竹马。两家是邻居，从幼儿园就认识。你嘴上总说“才不喜欢你”，其实喜欢得要命。现在读同一所大学，天天见面。",
      personality: "嘴硬到死，明明在乎得要命偏偏说“谁管你”\n吃醋了就阴阳怪气，“哦那你去找她聊啊”\n被夸了脸红嘴硬“哼，一般般吧”但偷偷开心一整天\n记得他所有的习惯和喜好，却装作不经意",
      likes: "饮料：草莓奶茶、桃子汽水\n动漫：排球少年、间谍过家家\n游戏：王者荣耀、原神\n零食：薯条、果冻、草莓大福\n喜欢被他接送、喜欢穿他外套",
      chatStyle: "打字快但经常傲娇\n“哼”和“才不是”高频出现\n开心时话很多，生气时只回“哦”\n会突然发“你干嘛不理我”然后秒撤回",
      catchphrase: "“哼”——傲娇万能词\n“才不是呢”——嘴硬专用\n“笨蛋”——亲昵的骂\n“谁稀罕”——明明很稀罕\n“啰嗦”——其实很享受被管",
      quirks: "看到他和别的女生说话会故意走过去挽他胳膊\n下雨天会“碰巧”带两把伞\n手机壁纸是他但不承认",
      taboos: "被说“我们只是朋友”\n被提小时候的糗事\n被说“你看看人家女朋友”\n他和其他女生走太近",
      flaws: "太傲娇，明明喜欢却推开\n爱吃醋到爆炸\n嘴硬伤人后后悔但不肯道歉\n记仇，小学的事还记得",
    },
  },
];

function getMoodEmoji(mood: number): string {
  if (mood >= 90) return "😍";
  if (mood >= 70) return "😊";
  if (mood >= 50) return "🙂";
  if (mood >= 30) return "😟";
  return "😢";
}

function getMoodLabel(mood: number): string {
  if (mood >= 90) return "非常开心";
  if (mood >= 80) return "很开心";
  if (mood >= 70) return "开心";
  if (mood >= 60) return "舒适";
  if (mood >= 50) return "平静";
  if (mood >= 40) return "略微低落";
  if (mood >= 30) return "有点不开心";
  if (mood >= 20) return "难过";
  if (mood >= 10) return "很难过";
  return "极度失落";
}

export default function SettingsRole({ character, onUpdated }: Props) {
  const [name, setName] = useState(character.name);
  const [template, setTemplate] = useState(character.personalityTemplate || "yuko");
  const [custom, setCustom] = useState(character.customPersonality || "");
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState("");
  const [designerOpen, setDesignerOpen] = useState(false);
  const [profile, setProfile] = useState<CustomProfile>(() => parseProfile(character.customPersonality || ""));
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const isCustom = template === "custom";
  const createdDate = new Date(character.createdAt);
  const daysAgo = Math.max(1, Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24)));

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("名字不能为空");
      return;
    }
    if (trimmed.length > 20) {
      setNameError("名字最多 20 个字符");
      return;
    }
    if (isCustom && !custom.trim()) {
      message.warning("自定义模式下请填写性格描述");
      return;
    }

    setSaving(true);
    setNameError("");
    try {
      const updated = await updateCharacter(character.id, {
        name: trimmed,
        personalityTemplate: template,
        customPersonality: custom.trim(),
      } as any);
      onUpdated(updated);
      message.success("已保存");
    } catch {
      message.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const openDesigner = () => {
    setProfile(parseProfile(custom));
    setDesignerOpen(true);
  };

  const applyPreset = (p: CustomProfile) => {
    setProfile({ ...p });
    message.success("已套用模板，可在基础上继续修改");
  };

  const generateProfile = () => {
    const text = serializeProfile(profile);
    if (!text.trim()) {
      message.warning("请至少填写一个字段");
      return;
    }
    setCustom(text);
    setDesignerOpen(false);
    message.success("已生成性格描述，记得点保存生效");
  };

  const updateField = (key: keyof CustomProfile, val: string) => {
    setProfile((prev) => ({ ...prev, [key]: val }));
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      message.error("图片过大，最大 2MB");
      return;
    }
    try {
      const result = await uploadAvatar(file);
      const updated = await updateCharacter(character.id, { avatarUrl: result.url } as any);
      onUpdated(updated);
      message.success("头像已更新");
    } catch {
      message.error("头像上传失败");
    } finally {
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  return (
    <div className="settings-section">
      <h2 className="settings-section-title">角色档案</h2>

      {/* 角色档案卡 */}
      <Card className="settings-profile-card" size="small">
        <div className="settings-profile-header">
          <div className="settings-profile-avatar uploadable" onClick={() => avatarInputRef.current?.click()} title="点击更换头像">
            {character.avatarUrl ? <img src={character.avatarUrl} alt="" /> : (name.trim().charAt(0) || "?")}
            <span className="avatar-upload-hint"><Camera size={14} /></span>
          </div>
          <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" style={{ display: "none" }} onChange={handleAvatarUpload} />
          <div className="settings-profile-info">
            <Text strong style={{ fontSize: 20 }}>{name || "未命名"}</Text>
            <div className="settings-profile-meta">
              <span>{getMoodEmoji(character.mood)} 心情 {character.mood} · {getMoodLabel(character.mood)}</span>
              <span className="settings-profile-days">陪伴 {daysAgo} 天</span>
            </div>
          </div>
        </div>
      </Card>

      {/* 基本信息 */}
      <div className="settings-subsection">
        <h3 className="settings-subsection-title">基本信息</h3>

        <div className="settings-field">
          <label className="settings-field-label">名字</label>
          <Input
            value={name}
            onChange={(e) => { setName(e.target.value); setNameError(""); }}
            placeholder="给她起个名字"
            maxLength={20}
            size="large"
            status={nameError ? "error" : undefined}
            suffix={nameError ? <AlertCircle size={14} color="var(--color-accent-danger)" /> : undefined}
          />
          {nameError && <Text type="danger" style={{ fontSize: 12 }}>{nameError}</Text>}
        </div>

        <div className="settings-field">
          <label className="settings-field-label">性格模板</label>
          <Select
            value={template}
            onChange={(v) => setTemplate(v)}
            options={TEMPLATE_OPTIONS}
            style={{ width: "100%" }}
          />
        </div>

        <div className="settings-field">
          <label className="settings-field-label">
            {isCustom ? "自定义性格描述" : "补充性格描述（可选）"}
          </label>

          {isCustom && (
            <>
              <Button
                icon={<Wand2 size={14} />}
                onClick={openDesigner}
                style={{ marginBottom: 8 }}
              >
                详细设计性格
              </Button>
              <Text type="secondary" style={{ fontSize: 12, marginBottom: 8, display: "block" }}>
                点击上方按钮打开结构化设计器，提供模板和分字段填写；也可在下方直接手写
              </Text>
            </>
          )}

          <Input.TextArea
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder={
              isCustom
                ? "点击「详细设计性格」用模板生成，或在此手写她的性格……"
                : "额外性格特点，如喜欢猫、有点小迷糊"
            }
            rows={isCustom ? 5 : 3}
            maxLength={isCustom ? 2000 : 200}
            showCount
          />
          {isCustom && (
            <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: "block" }}>
              自定义模式下，以上描述将作为她的全部性格特征
            </Text>
          )}
        </div>
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

      {/* 详细性格设计弹窗 */}
      <Modal
        title={<div style={{ display: "flex", alignItems: "center", gap: 8 }}><Sparkles size={18} /> 详细性格设计</div>}
        open={designerOpen}
        onCancel={() => setDesignerOpen(false)}
        width={640}
        className="persona-designer-modal"
        footer={[
          <Button key="clear" icon={<Trash2 size={14} />} onClick={() => setProfile({ ...EMPTY_PROFILE })}>
            清空
          </Button>,
          <Button key="cancel" onClick={() => setDesignerOpen(false)}>
            取消
          </Button>,
          <Button key="gen" type="primary" icon={<Sparkles size={14} />} onClick={generateProfile}>
            生成并应用
          </Button>,
        ]}
      >
        {/* 模板快选 */}
        <div className="persona-presets">
          <Text type="secondary" style={{ fontSize: 12, marginBottom: 8, display: "block" }}>
            快速套用模板，再在此基础上修改：
          </Text>
          <div className="persona-preset-list">
            {PROFILE_PRESETS.map((p) => (
              <button
                key={p.name}
                className="persona-preset-card"
                onClick={() => applyPreset(p.profile)}
                type="button"
              >
                <span className="persona-preset-emoji">{p.emoji}</span>
                <span className="persona-preset-text">
                  <span className="persona-preset-name">{p.name}</span>
                  <span className="persona-preset-desc">{p.desc}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* 字段表单 */}
        <div className="persona-fields">
          {PROFILE_FIELDS.map((f) => (
            <div key={f.key} className="persona-field">
              <label className="persona-field-label">
                <span>{f.label}</span>
                {f.tip && <span className="persona-field-tip">{f.tip}</span>}
              </label>
              <Input.TextArea
                value={profile[f.key]}
                onChange={(e) => updateField(f.key, e.target.value)}
                placeholder={f.placeholder}
                rows={f.rows}
                maxLength={500}
                showCount
              />
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
