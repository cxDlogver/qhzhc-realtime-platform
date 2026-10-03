import request from "@/utils/request.js";
import qs from "qs";

export function PRI(data) {
  // PRI数据查询接口
  return request({
    url: "/api/chart/PRI",
    method: "get",
    params: data,
  });
}

export function timeSlotSearch(data) {
  return request({
    url: "/api/chart/dataTrans/between",
    method: "get",
    params: data,
  });
}

export function fiveMinuteSearch(data) {
  return request({
    url: "/api/chart/dataTrans/5min",
    method: "get",
    params: data,
  });
}

// 用户信息相关接口
// 用户注册
export function userRegister(data) {
  return request({
    url: "/auth/register/",
    method: "post",
    data: data,
  });
}
// 验证码发送(邮箱通知）
export function sendEmailCode(data) {
  return request({
    url: "auth/eamil_code/",
    method: "post",
    data: data,
  });
}

// 用户登录
export function userLogin(data) {
  return request({
    url: "/auth/login/",
    method: "post",
    data: data,
  });
}

export function userLogout() {
  return request({
    url: "/auth/logout/",
    method: "post",
  });
}

// 用户列表查询接口
export function userList(token) {
  return request({
    url: "/auth/admin/list/",
    method: "get",
    headers: {
      token: token, // 添加token到请求头
    },
  });
}

// 用户信息修改
export function userEdit(data, token) {
  return request({
    url: "/auth/user/update_detail/",
    method: "post",
    data: data,
    headers: {
      token: token, // 添加token到请求头
    },
  });
}

// 用户删除
export function userDelete(data, token) {
  return request({
    url: "/auth/admin/delete/",
    method: "delete",
    data: data,
    headers: {
      token: token, // 添加token到请求头
    },
  });
}

// 用户查找
export function userSearch(data, token) {
  return request({
    url: "/auth/admin/find/",
    method: "get",
    params: data,
    headers: {
      token: token, // 添加token到请求头
    },
  });
}

//用户权限修改
export function userAuthorityEdit(data, token) {
  return request({
    url: "/auth/admin/update_permissions/",
    method: "post",
    data: data,
    headers: {
      token: token, // 添加token到请求头
    },
  });
}

//用户密码修改
export function userPasswordEdit(data, token) {
  return request({
    url: "/auth/user/update_passwd/",
    method: "post",
    data: data,
    headers: {
      token: token, // 添加token到请求头
    },
  });
}

/** 数据资源相关接口 */
// 数据主题和行业
export function dataTop(token) {
  return request({
    url: "/files/datatop/",
    method: "get",
    headers: {
      token: token,
    },
  });
}
//单个数据集查看
export function approvefile(data) {
  return request({
    url: "/files/approvefile/",
    method: "post",
    data: data,
    headers: {
      "Content-Type":
        "multipart/form-data; boundary=----WebKitFormBoundaryn8D9asOnAnEU4Js0",
    },
  });
}

// 文件已审核列表查询
export function approvelist(data) {
  return request({
    url: "/files/approvelist/",
    method: "post",
    data: data,
    headers: {
      "Content-Type":
        "multipart/form-data; boundary=----WebKitFormBoundaryn8D9asOnAnEU4Js0",
    },
  });
}
// 单个文件查询
export function fileview(data) {
  return request({
    url: "/files/fileview/",
    method: "post",
    data: data,
    headers: {
      "Content-Type":
        "multipart/form-data; boundary=----WebKitFormBoundaryn8D9asOnAnEU4Js0",
    },
  });
}
// 单个文件下载
export function fileDownload(data) {
  return request({
    url: "/files/download/",
    method: "post",
    data: data,
    responseType: "blob",
    headers: {
      // "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
      "Content-Type":
        "multipart/form-data; boundary=----WebKitFormBoundaryn8D9asOnAnEU4Js0",
    },
  });
}
// 文件批量下载（压缩为zip包)
export function batchdownload(data) {
  return request({
    url: "/files/batchdownload/",
    method: "post",
    data: data,
    headers: {
      "Content-Type":
        "multipart/form-data; boundary=----WebKitFormBoundaryn8D9asOnAnEU4Js0",
    },
  });
}

// 数据总览接口
export function requiredList(data, token) {
  return request({
    url: "/files/requiredlist/",
    method: "post",
    data: qs.stringify(data),
    headers: {
      token: token,
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
  });
}

// 所有文件列表接口
export function reviewList(data, token) {
  return request({
    url: "/files/reviewlist/",
    method: "post",
    data: qs.stringify(data),
    headers: {
      token: token,
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
  });
}

// 文件审核接口
export function fileApproved(data, token) {
  return request({
    url: "/files/approved/",
    method: "post",
    data: qs.stringify(data),
    headers: {
      token: token,
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
  });
}
//审核列表详情
export function datasetview(data) {
  return request({
    url: "/files/datasetview/",
    method: "post",
    data: qs.stringify(data),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
  });
}
//数据文件批量下载
export function batchdownloadFile(data) {
  return request({
    url: "/files/batchfile_download/",
    method: "post",
    data: qs.stringify(data),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
    responseType: "blob",
  });
}
// Config信息修改接口
export function editConfigres(data) {
  return request({
    url: "/files/configres/",
    method: "post",
    data: qs.stringify(data),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
  });
}
//
export function uploadFiles(data) {
  return request({
    url: "/files/upload/",
    method: "post",
    data: data,
    headers: {
      "Content-Type":
        "multipart/form-data; boundary=----WebKitFormBoundaryn8D9asOnAnEU4Js0",
    },
  });
}
//团队及专家信息查询
export function expertTeam(data) {
  return request({
    url: "/files/expert_team/",
    method: "post",
    data: qs.stringify(data),
    urlType: true,
  });
}

//新闻上传
export function uploadNews(data) {
  return request({
    url: "/files/uploadress/",
    method: "post",
    data: data,
  });
}

//表格下载
export function downloadTable(data) {
  return request({
    url: "/files/download_expert_team/",
    method: "post",
    data: qs.stringify(data),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
    responseType: "blob",
  });
}
//首页图片查询
export function gethomepage(data) {
  return request({
    url: "/files/gethomepage/",
    method: "post",
    data: qs.stringify(data),
  });
}
// 图片上传
export function uphomepage(data) {
  return request({
    url: "/files/uphomepage/",
    method: "post",
    data: data,
    // headers: {
    //   "Content-Type":
    //     "multipart/form-data; boundary=----WebKitFormBoundaryn8D9asOnAnEU4Js0",
    // },
  });
}
//轮播图片状态修改
export function replace_homepng(data) {
  return request({
    url: "/files/replace_homepng/",
    method: "post",
    data: qs.stringify(data),
  });
}
//成果查询
export function searchResult(data) {
  return request({
    url: "/files/widely_search/",
    method: "post",
    data: qs.stringify(data),
  });
}
