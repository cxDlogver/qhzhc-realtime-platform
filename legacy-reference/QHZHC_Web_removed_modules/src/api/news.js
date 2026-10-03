import request from "@/utils/request.js";
import qs from "qs";
// 新闻动态
export function ressourceshow(data) {
  return request({
    url: "/files/ressourceshow/",
    method: "post",
    data: qs.stringify(data),
    urlType: true,
  });
}
// 新闻分类查询
export function Centerrecour(data) {
  return request({
    url: "files/Centerrecour/",
    method: "get",
    data: qs.stringify(data),
    urlType: true,
  });
}
//相关成果
export function dataresource(data) {
  return request({
    url: "files/dataresource/",
    method: "post",
    data: data,
    urlType: true,
  });
}
//最新四条新闻
export function latestnews(data) {
  return request({
    url: "/files/latestnews/",
    method: "get",
    data: data,
    urlType: true,
  });
}
