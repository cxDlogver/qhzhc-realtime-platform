const path = require("node:path");

/*
 * 开发环境默认把 /api 与 /ws 代理到后端，前端页面与 API 同源，不再产生跨域请求。
 * 若显式设置了 VUE_APP_API_BASE_URL，代理目标跟随该地址。
 */
const backendTarget = (
  process.env.VUE_APP_API_BASE_URL || "http://127.0.0.1:18080"
).replace(/\/$/, "");

/*
 * @Author: zhou
 * @Date: 2024-03-18 14:23:03
 * @LastEditors: zhou
 * @LastEditTime: 2024-07-15 15:08:06
 * @Description:
 * @param:
 * @return:
 */
module.exports = {
  publicPath: "./", //   部署应用包时的基本 URL
  outputDir: "dist", //   打包时输出的文件目录
  assetsDir: "static", //   放置静态文件夹目录
  lintOnSave: false, //关闭了eslint检查
  configureWebpack: {
    entry: {
      app: path.resolve(__dirname, "src/main.ts"),
    },
    resolve: {
      extensions: [".ts", ".tsx", ".mjs", ".js", ".jsx", ".vue", ".json"],
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: [
            {
              loader: path.resolve(
                __dirname,
                "build/typescript-transpile-loader.cjs",
              ),
            },
          ],
        },
      ],
    },
  },
  devServer: {
    host: "127.0.0.1",
    port: 9527, //开发环境运行时的端口
    https: false, //是否启用HTTPS协议
    open: false, //由开发者按需打开浏览器，避免启动命令依赖桌面环境
    hot: true, //是否开启热加载
    client: {
      overlay: false,
    },
    proxy: {
      // 所有 REST API 转发到后端，路径保持不变。
      // 注意：不要代理 "/ws" —— 它是 webpack-dev-server HMR 自带的 WebSocket 端点，
      // 一旦转发，热更新连接会被后端按非法 Upgrade 销毁并持续抛出 ECONNRESET。
      // 业务 WebSocket 不受同源策略限制，由前端直连后端。
      "/api": {
        target: backendTarget,
        secure: false, // https 请求则使用 true
        changeOrigin: true,
      },
    },
  },
};
