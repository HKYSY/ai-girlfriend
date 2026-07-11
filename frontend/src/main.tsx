import React from "react";
import ReactDOM from "react-dom/client";
import { ConfigProvider, theme as antdTheme } from "antd";
import zhCN from "antd/locale/zh_CN";
import App from "./App";
import "./index.css";

// 强制设置页面标题，避免浏览器缓存旧版 index.html 导致标题不更新
document.title = "AI女友";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: "#e91e63",
          colorInfo: "#e91e63",
          colorSuccess: "#66bb6a",
          colorWarning: "#ff9800",
          colorError: "#e53935",
          borderRadius: 10,
          fontFamily: "inherit",
        },
      }}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>
);
