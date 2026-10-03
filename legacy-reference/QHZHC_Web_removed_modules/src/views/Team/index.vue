<!-- 相关团队 -->
<template>
  <div class="team">
    <div class="team-left">
      <div
        :class="['box', { active: active == 'team' }]"
        @click="titleChange('team')"
      >
        <div class="icon">
          <i class="iconfont icon-a-tuandui2"></i>
        </div>
        <span class="title">研究团队</span>
      </div>
      <div
        :class="['box', { active: active == 'people' }]"
        @click="titleChange('people')"
      >
        <div class="icon">
          <i class="iconfont icon-keyan"></i>
        </div>
        <span class="title">研究人员</span>
      </div>
      <div
        :class="['box', { active: active == 'expert' }]"
        @click="titleChange('expert')"
      >
        <div class="icon">
          <i class="iconfont icon-zhuanjia"></i>
        </div>
        <span class="title">行业专家</span>
      </div>
      <div
        :class="['box', { active: active == 'join' }]"
        @click="titleChange('join')"
      >
        <div class="icon">
          <i class="iconfont icon-jiaruwomen"></i>
        </div>
        <span class="title">加入我们</span>
      </div>
    </div>
    <div class="content">
      <div class="team-content" v-if="active == 'team'">
        <div class="content-title">研究团队介绍：</div>
        <div class="team-li" v-for="(item, index) in teamList" :key="index">
          <p>{{ item.maininfo }}</p>
          <div class="link" v-if="item.homepage && item.homepage != 'null'">
            主页：
            <el-link
              :href="item.homepage"
              target="_blank"
              style="color: #0095ff"
            >
              {{ item.homepage }}
            </el-link>
          </div>
        </div>
      </div>
      <div class="ky-people" v-if="active == 'people'">
        <!-- <div class="content-title">【 研究人员 】</div> -->
        <div class="team-member">
          <el-row :gutter="20">
            <el-col
              :xs="24"
              :sm="24"
              :md="24"
              :lg="12"
              :xl="8"
              v-for="item in memberList"
              :key="item.name"
            >
              <div class="member-detail">
                <div class="member-top">
                  <div class="member-picture">
                    <img :src="item.img" alt="" />
                  </div>
                  <div class="member-info">
                    <div>
                      <p class="member-msg">{{ item.info }}</p>
                      <p class="member-name"><span></span>{{ item.name }}</p>
                    </div>
                  </div>
                </div>

                <div class="msg">
                  <div class="member-form">
                    <i class="iconfont icon-yanjiuzhulu"></i>
                    <div
                      style="width: 76px; color: #e0efff; flex: 0 0 auto"
                      v-if="item.type == 'research'"
                    >
                      研究方向：
                    </div>
                    <div
                      style="width: 76px; color: #e0efff; flex: 0 0 auto"
                      v-if="item.type == 'work'"
                    >
                      工作方向：
                    </div>
                    <div>{{ item.direction }}</div>
                  </div>
                  <div class="member-form">
                    <i class="iconfont icon-youxiang"></i>
                    <div style="width: 55px; color: #e0efff; flex: 0 0 auto">
                      邮箱：
                    </div>
                    <div class="form-value">
                      <div
                        v-for="(value, emailIndex) in item.email"
                        :key="emailIndex"
                        class="email-li"
                      >
                        {{ value }}
                      </div>
                      <!-- {{ item.email }} -->
                    </div>
                  </div>
                </div>
              </div>
            </el-col>
          </el-row>
        </div>
      </div>
      <div class="people-list" v-if="active == 'expert'">
        <div class="content-title">行业专家：</div>
        <div class="people-li" v-for="(item, index) in peopleList" :key="index">
          <div class="img-box">
            <img :src="item.imageurl" />
          </div>
          <div class="people-detail">
            <p class="name">{{ item.expertname }}</p>
            <p class="people-msg" style="white-space: pre-wrap">
              {{ item.maininfo }}
            </p>
            <p class="email">邮箱：{{ item.eamil }}</p>
            <p class="file">
              主页：
              <el-link
                :href="item.homepage"
                target="_blank"
                style="color: #0095ff"
              >
                {{ item.homepage }}
              </el-link>
            </p>
          </div>
        </div>
      </div>
      <!-- 加入我们 -->
      <div class="join-content" v-if="active == 'join'">
        <div class="join-info">
          <div class="join-slogan">开放 · 合作 · 共享 · 协同 · 创新</div>
          <div class="join-intro">
            <p>
              清华大学CarbonScope平台致力于打造国际领先的温室气体监测与计量研究网络，现诚邀各界专家与团队加盟，共同推动碳中和前沿创新。
            </p>
            <p>
              我们诚挚邀请有志于温室气体监测与计量研究的专家、学者、研究人员和学生加入我们的团队，共同推动碳中和前沿创新。
            </p>
            <p>以下是加入我们的方式和流程：</p>
          </div>

          <div class="join-section">
            <h3>一、专家加盟</h3>
            <p>
              CarbonScope温室气体监测和计量平台旨在汇聚众多温室气体监测与计量领域具有深厚造诣的专家。我们期待您的加入，为CarbonScope注入新的智慧与力量。专家加盟后，将共同参与国家重大科研项目，与顶尖学者合作，共同探索温室气体监测与计量的前沿技术与应用。
            </p>

            <h4>（一）专家要求</h4>
            <ol>
              <li>
                具备相关领域的高级职称或博士学位，有丰富的研究经验和成果。
              </li>
              <li>主要研究方向与温室气体监测、计量、减排等相关。</li>
              <li>
                具有良好的团队合作精神和沟通能力，能够积极参与科研活动和项目合作。
              </li>
            </ol>

            <h4>（二）专家权益</h4>
            <ol>
              <li>联合申报及承担的国家重大科研项目，共享科研资源和成果。</li>
              <li>共同组织高水平学术会议和研讨会，展示您的研究成果。</li>
              <li>与国内外顶尖学者交流合作，拓展学术视野和人脉资源。</li>
            </ol>
            <p>
              团队将为您提供良好的科研环境和发展空间，支持您的科研工作和职业发展。
            </p>
          </div>

          <div class="join-section">
            <h3>二、团队加盟</h3>
            <p>
              CarbonScope
              团队欢迎具有相关研究方向和业务范围的科研团队加盟。团队加盟后，将与
              CarbonScope
              团队共同开展科研项目合作，共享科研资源和成果，提升团队的科研水平和影响力。
            </p>

            <h4>（一）团队要求</h4>
            <ol>
              <li>
                团队依托单位应为高校、科研机构或相关企业，具有良好的科研基础和条件。
              </li>
              <li>
                团队主要研究方向与温室气体监测、计量、减排等相关，具有明确的研究目标和任务。
              </li>
              <li>团队成员构成合理，具备开展相关科研工作的能力和条件。</li>
              <li>
                团队负责人应具有高级职称或博士学位，具备较强的科研组织和管理能力。
              </li>
            </ol>

            <h4>（二）团队权益</h4>
            <ol>
              <li>
                优先参与 CarbonScope
                团队组织的科研项目合作，共同申请科研经费和开展研究工作。
              </li>
              <li>
                共享 CarbonScope
                团队的科研资源和平台，包括温室气体监测设备、数据资源、实验室等。
              </li>
              <li>
                与 CarbonScope
                团队及其他加盟团队开展学术交流和合作研究，共同提升科研水平。
              </li>
              <li>
                团队成员有机会参加 CarbonScope
                团队组织的培训和学术活动，提升专业技能和综合素质。
              </li>
            </ol>
          </div>

          <div class="join-section">
            <h3>三、如何加入</h3>
            <p>
              无论您是个人专家还是科研团队，加入 CarbonScope
              团队都需经过以下流程：
            </p>

            <h4>1、提交申请</h4>
            <ol>
              <li>
                专家申请：下载并填写《CarbonScope联合研究团队专家信息收集表》，详细填写个人信息、研究方向、代表性成果等内容。
              </li>
              <li>
                团队申请：下载并填写《CarbonScope联合研究团队团队信息收集表》，详细填写团队/单位名称、依托单位、团队简介、主要研究方向、团队成员构成、代表性成果等内容。
              </li>
            </ol>

            <h4>2. 提交申请</h4>
            <p>
              将填写完整的信息收集表、简介、代表性成果证明材料等发送至CarbonScope
              团队主管老师邮箱：<a
                href="mailto:xuchun@tsinghua.edu.cn"
                style="color: #0095ff"
                >xuchun@tsinghua.edu.cn</a
              >
            </p>

            <h4>3. 审核与洽谈</h4>
            <p>
              团队将对提交的申请材料进行审核，并邀请申请人/团队进行交流。交流完成后，将正式邀请加入CarbonScope联合研究团队。
            </p>

            <h4>4. 签订合作协议</h4>
            <p>
              加入团队后，双方将签订合作协议，明确合作内容、权利与义务等事项。
            </p>

            <h4>5. 加入团队</h4>
            <p>
              签订协议后，申请者将正式成为 CarbonScope
              团队的一员，可参与团队的科研项目、学术交流、平台使用等活动，共同推动温室气体监测与计量领域的发展。
            </p>
          </div>

          <div class="join-section">
            <h3>四、研究人员招募</h3>
            <ol>
              <li>
                关注招聘信息：平台将不定期发布行业团队博士后、博士生、硕士生等研究人员招募信息，敬请关注CarbonScope官方网站。
              </li>
              <li>
                提交申请材料：根据招聘信息要求，准备并提交个人简历、研究计划、推荐信等申请材料。
              </li>
              <li>
                审核与面试：相关团队将对提交的申请材料进行审核，并通知符合条件的申请人参加面试。面试通过后，将正式录取。
              </li>
            </ol>
          </div>

          <div class="join-section">
            <h3>五、联系方式</h3>
            <p>如有任何疑问或需要进一步了解，欢迎通过以下方式联系我们：</p>
            <div class="contact-info">
              <p><strong>联系人：</strong>许老师</p>
              <p>
                <strong>邮箱：</strong
                ><a href="mailto:xuchun@tsinghua.edu.cn" style="color: #0095ff"
                  >xuchun@tsinghua.edu.cn</a
                >
              </p>
              <p><strong>地址：</strong>清华大学环境学院229</p>
            </div>
            <p class="join-ending">
              我们期待您的加入，共同为实现碳中和目标贡献力量！
            </p>
          </div>
          <!-- 文件下载区域 -->
          <div class="join-download-area">
            <div class="download-list">
              <div class="download-item">
                <img
                  :src="require('@/assets/imgs/Word-Color.png')"
                  alt="word"
                  class="word-icon"
                />
                <span class="file-name">专家信息收集表.docx</span>
                <!-- <span class="file-size">{{ expertFileSize ? expertFileSize + ' kb' : '...' }}</span> -->
                <div
                  class="download-arrow-btn"
                  title="点击下载"
                  @click="exportTbale('expert')"
                >
                  <i
                    class="iconfont icon-shuyi_xiazai"
                    style="font-size: 28px; color: #1abc9c"
                  ></i>
                </div>
              </div>
              <div class="download-item">
                <img
                  :src="require('@/assets/imgs/Word-Color.png')"
                  alt="word"
                  class="word-icon"
                />
                <span class="file-name">团队信息收集表.docx</span>
                <!-- <span class="file-size">{{ teamFileSize ? teamFileSize + ' kb' : '...' }}</span> -->
                <div
                  class="download-arrow-btn"
                  title="点击下载"
                  @click="exportTbale('team')"
                >
                  <i
                    class="iconfont icon-shuyi_xiazai"
                    style="font-size: 28px; color: #1abc9c"
                  ></i>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<script>
import { expertTeam, downloadTable } from "@/api/home";
export default {
  name: "TeamIndex",
  data() {
    return {
      //团队信息
      teamList: [],
      //人员信息
      peopleList: [],
      //成员信息
      memberList: [
        // {
        //   name: "鲁玺",
        //   info: "清华大学环境学院",
        //   direction: "区域与园区温室气体监测与核算",
        //   email: ["xilu@tsinghua.edu.cn"],
        //   img: require('../../assets/imgs/team/photo1.png'),
        //   type: "research"
        // },
        // {
        //   name: "许春",
        //   info: "清华大学环境学院",
        //   direction: "温室气体监测与排放表征",
        //   email: ['xuchunhabur@163.com', 'Xuchun@tsinghua.edu.cn'],
        //   img: require('../../assets/imgs/team/photo2.png'),
        //   type: "research"
        // },
        // {
        //   name: "景建凯",
        //   info: "清华大学2023级博士生",
        //   direction: "煤矿甲烷排放源识别技术及减排路径研究",
        //   email: ["58646042@qq.com"],
        //   img: require('../../assets/imgs/team/photo3.png'),
        //   type: "research"
        // },
        // {
        //   name: "程垦",
        //   info: "清华大学环境学院博士后",
        //   direction: "大数据统筹优化与局地温室气体排放表征",
        //   email: ["chengken@mail.tsinghua.edu.cn"],
        //   img: require('../../assets/imgs/team/photo4.png'),
        //   type: "research"
        // },
        // {
        //   name: "高澜",
        //   info: "清华大学2022级博士生",
        //   direction: "煤矿甲烷排放监测与量化",
        //   email: ["gl22@mails.tsinghua.edu.cn"],
        //   img: require('../../assets/imgs/team/photo5.png'),
        //   type: "research"
        // },
        // {
        //   name: "陈彬灵",
        //   info: "清华大学2025级硕士生",
        //   direction: "煤矿甲烷监测",
        //   email: ["chen-bl21@mails.tsinghua.edu.cn"],
        //   img: require('../../assets/imgs/team/photo6.png'),
        //   type: "research"
        // },
        // {
        //   name: "王飚",
        //   info: "山西航天工业研究院集团有限公司",
        //   direction: "信息计算与智能系统 ",
        //   email: ["marsjp5385@gmail.com"],
        //   img: require('../../assets/imgs/team/photo7.png'),
        //   type: "research"
        // },
        // {
        //   name: "李洋",
        //   info: "山西航天华碳科技有限公司",
        //   direction: "温室气体监测",
        //   email: ["41800280@qq.com"],
        //   img: require('../../assets/imgs/team/photo8.png'),
        //   type: "work"
        // },
      ],
      active: "team",
    };
  },
  mounted() {
    expertTeam({ datatype: "团队" }).then((res) => {
      this.teamList = res.data.record;
    });
    expertTeam({ datatype: "成员" }).then((res) => {
      // this.teamList = res.data.record
      this.memberList = res.data.memberList;
    });
    this.getTable();
  },
  methods: {
    // 文件下载
    exportTbale(value) {
      var filename = "";
      if (value == "team") {
        filename = "团队信息收集表.docx";
      } else {
        filename = "专家信息收集表.docx";
      }
      downloadTable({ download_type: value }).then((res) => {
        this.downloadData(res.data, filename);
      });
    },
    //下载事件
    downloadData(data, filename) {
      let blob = new Blob([data]);
      let url = window.URL.createObjectURL(blob);
      const link = document.createElement("a"); // 创建a标签
      link.href = url;
      link.download = filename; // 重命名文件
      link.click();
      URL.revokeObjectURL(url); // 释放内存
    },
    //专家信息请求
    getTable() {
      expertTeam({ datatype: "专家" }).then((res) => {
        this.peopleList = res.data.record;
      });
    },
    // 页面切换
    titleChange(value) {
      this.active = value;
    },
  },
};
</script>
<style lang="scss" scoped>
@media screen and (max-width: 750px) {
  .team-left {
    width: 40px;
    height: 100%;
    margin-right: 10px;

    .box {
      width: 100%;
      text-align: center;
      cursor: pointer;
      margin-bottom: 10px;
      .icon {
        margin-left: auto;
        margin-right: auto;
        width: 36px;
        height: 36px;
        background: linear-gradient(137deg, rgba(0, 0, 0, 0) 5%, #0095ff 103%);
        box-sizing: border-box;
        border: 1px solid rgba(0, 149, 255, 0.84);
        display: flex;
        align-items: center;
        justify-content: center;
        i {
          font-size: 20px;
        }
      }
      .title {
        font-weight: 500;
        font-size: 14px;
        line-height: 25px;
        letter-spacing: 0em;
        color: #d3e1ff;
      }
    }
    .box.active {
      .icon {
        background: linear-gradient(
          142deg,
          rgba(0, 0, 0, 0) -17%,
          rgba(43, 227, 255, 0.9) 45%,
          #12ff9b 90%
        );
        box-shadow: 0px 4px 10px 0px rgba(0, 0, 0, 0.22),
          inset 0px 0px 27px 0px rgba(0, 0, 0, 0.34);
      }
      .title {
        color: #ffffff;
      }
    }
  }
  .content {
    width: calc(100% - 46px);
    height: 100%;
    box-sizing: border-box;
    overflow-y: auto;
    background: rgba(94, 116, 153, 0.19);
    padding: 10px;
    .content-title {
      font-size: 18px;
      font-weight: bold;
      margin-bottom: 10px;
      color: #fff;
    }
    .team-content {
      // margin-top: 16px;
      width: 100%;
      margin: auto;
      .team-li {
        font-size: 16px;
        font-weight: normal;
        line-height: 30px;
        color: #e0efff;
        margin-top: 16px;
        p {
          text-indent: 2em;
        }
        .link {
          line-height: 30px;
          color: #0095ff;
          font-size: 14px;
        }
      }
    }
    .ky-people {
      width: 100%;
      overflow-x: hidden;
      .team-member {
        display: flex;
        // justify-content: space-between;
        justify-content: flex-start;
        flex-wrap: wrap;
        .member-detail {
          // height: 220px;
          // width: 530px;
          border-radius: 4px;
          opacity: 1;
          background: rgba(189, 212, 255, 0.08);
          box-sizing: border-box;
          border: 1px solid rgba(255, 255, 255, 0.18);
          overflow: hidden;
          padding: 10px 8px;
          margin: 8px 0;
          .member-top {
            width: 100%;
            height: 134px;
            .member-picture {
              width: 80px;
              height: 104px;
              padding: 6px;
              background: #ffffff;
              float: left;
              img {
                width: 80px;
                height: 104px;
                object-fit: cover;
              }
            }
            .member-info {
              float: left;
              margin-left: 10px;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              // width: 350px;
              width: calc(100% - 130px);
              height: 134px;
              .member-msg {
                font-size: 14px;
                font-weight: normal;
                line-height: 24px;
                letter-spacing: 0px;
                font-variation-settings: "opsz" auto;
                color: rgba(255, 255, 255, 0.6);
              }
              .member-name {
                line-height: 24px;
                margin-top: 16px;
                // margin-bottom: 30px;
                span {
                  display: inline-block;
                  width: 4px;
                  height: 24px;
                  border-radius: 4px;
                  background: #0095ff;
                  vertical-align: top;
                  margin-right: 18px;
                }
              }
              .member-form {
                line-height: 28px;
                color: #ffffff;
                font-size: 14px;
                word-wrap: break-word;
                display: flex;
                justify-content: flex-start;
                i {
                  color: #e0efff;
                  margin-right: 10px;
                }
                span {
                  display: inline-block;
                  color: #e0efff;
                }
                .form-value {
                  word-wrap: break-word;
                  .email-li {
                    word-wrap: break-word;
                  }
                }
              }
            }
          }

          .msg {
            width: 100%;
            .member-form {
              width: 100%;
              line-height: 28px;
              color: #ffffff;
              font-size: 14px;
              word-wrap: break-word;
              display: flex;
              justify-content: flex-start;
              i {
                color: #e0efff;
                margin-right: 10px;
              }
              span {
                display: inline-block;
                color: #e0efff;
              }
              .form-value {
                word-wrap: break-word;
                .email-li {
                  word-wrap: break-word;
                }
              }
            }
          }
        }
      }
    }
    .people-list {
      width: 100%;
      margin: auto;
      // margin-top: 20px;
      .people-li {
        margin: 8px 0;
        width: 100%;
        background: rgba(0, 149, 255, 0.06);
        padding: 8px;
        box-sizing: border-box;
        // display: flex;
        // flex-direction: row;
        // justify-content: space-around;
        .img-box {
          width: 100px;
          float: left;
          clear: both;
          margin-right: 6px;
          margin-bottom: 6px;
          img {
            background: #fff;
            width: 100px;
            // height: 141px;
          }
        }
        .people-detail {
          // width: calc(100% - 110px);
          .name {
            font-size: 19px;
            font-weight: bold;
          }
          .people-msg {
            margin-top: 14px;
            font-size: 16px;
            font-weight: normal;
            line-height: 30px;
            color: #e0efff;
          }
          .email {
            font-size: 16px;
            margin-top: 14px;
            line-height: 30px;
          }
          .file {
            font-size: 16px;
            line-height: 30px;
            color: #0095ff;
          }
        }
      }
    }
    .join-content {
      width: 100%;
      margin: auto;
      .join-info {
        .join-slogan {
          font-size: 24px;
          font-weight: bold;
          color: #0095ff;
          text-align: center;
        }
        .join-intro {
          margin: 20px 0;
          p {
            font-size: 16px;
            line-height: 28px;
            color: #e0efff;
            margin-bottom: 16px;
            text-indent: 2em;
          }
        }
        .join-section {
          h3 {
            font-weight: 500;
            font-size: 16px;
            color: #fff;
            line-height: 30px;
          }
          p {
            font-weight: 400;
            font-size: 16px;
            color: #e0efff;
            line-height: 30px;
            text-indent: 2rem;
          }
          h4 {
            line-height: 30px;
            text-indent: 2rem;
          }
          ol {
            li {
              font-weight: 400;
              font-size: 16px;
              color: #e0efff;
              line-height: 30px;
              text-indent: 2rem;
            }
          }
        }
        .join-download-area {
          .download-list {
            width: 100%;
            overflow: hidden;
            .download-item {
              float: left;
            }
          }
        }
      }
    }
  }
}
@media screen and (min-width: 750px) {
  .team-left {
    width: 90px;
    height: 100%;
    margin-right: 10px;
    background: linear-gradient(180deg, #001e36 0%, rgba(0, 0, 0, 0) 100%);
    box-sizing: border-box;
    border: 1px solid;
    border-image: linear-gradient(0deg, #0095ff 0%, rgba(7, 220, 249, 0) 100%);
    box-shadow: inset 0px 6px 10px 0px rgba(0, 149, 255, 0.32);
    .box {
      width: 100%;
      height: 80px;
      text-align: center;
      cursor: pointer;
      .icon {
        margin-top: 30px;
        margin-left: auto;
        margin-right: auto;
        width: 50px;
        height: 50px;
        background: linear-gradient(137deg, rgba(0, 0, 0, 0) 5%, #0095ff 103%);
        box-sizing: border-box;
        border: 1px solid rgba(0, 149, 255, 0.84);
        display: flex;
        align-items: center;
        justify-content: center;
        i {
          font-size: 30px;
        }
      }
      .title {
        font-weight: 500;
        font-size: 16px;
        line-height: 25px;
        letter-spacing: 0em;
        color: #d3e1ff;
      }
    }
    .box.active {
      .icon {
        background: linear-gradient(
          142deg,
          rgba(0, 0, 0, 0) -17%,
          rgba(43, 227, 255, 0.9) 45%,
          #12ff9b 90%
        );
        box-shadow: 0px 4px 10px 0px rgba(0, 0, 0, 0.22),
          inset 0px 0px 27px 0px rgba(0, 0, 0, 0.34);
      }
      .title {
        color: #ffffff;
      }
    }
  }
  .content {
    width: calc(100% - 100px);
    height: 100%;
    background: rgba(94, 116, 153, 0.19);
    padding: 10px;
    box-sizing: border-box;
    overflow-y: auto;
    .content-title {
      font-size: 20px;
      font-weight: bold;
      line-height: 58px;
      color: #fff;
    }
    .team-content {
      // margin-top: 16px;
      width: 90%;
      margin: auto;
      .team-li {
        font-size: 16px;
        font-weight: normal;
        line-height: 30px;
        color: #e0efff;
        margin-top: 16px;
        p {
          text-indent: 2em;
        }
        .link {
          line-height: 30px;
          color: #0095ff;
          font-size: 14px;
        }
      }
    }
    .ky-people {
      .team-member {
        display: flex;
        // justify-content: space-between;
        justify-content: flex-start;
        flex-wrap: wrap;
        .member-detail {
          height: 220px;
          // width: 530px;
          border-radius: 4px;
          opacity: 1;
          background: rgba(189, 212, 255, 0.08);
          box-sizing: border-box;
          border: 1px solid rgba(255, 255, 255, 0.18);
          overflow: hidden;
          padding: 18px 14px;
          margin: 8px;
          position: relative;
          .member-top {
            width: 100%;
            height: 168px;
            .member-picture {
              width: 122px;
              height: 168px;
              padding: 6px;
              background: #ffffff;
              float: left;
              img {
                width: 122px;
                height: 168px;
                object-fit: cover;
              }
            }
            .member-info {
              float: left;
              margin-left: 10px;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              // width: 350px;
              width: calc(100% - 152px);
              height: 180px;
              .member-msg {
                font-size: 14px;
                font-weight: normal;
                line-height: 24px;
                letter-spacing: 0px;
                font-variation-settings: "opsz" auto;
                color: rgba(255, 255, 255, 0.6);
              }
              .member-name {
                line-height: 24px;
                margin-top: 16px;
                // margin-bottom: 30px;
                span {
                  display: inline-block;
                  width: 4px;
                  height: 24px;
                  border-radius: 4px;
                  background: #0095ff;
                  vertical-align: top;
                  margin-right: 18px;
                }
              }
              .member-form {
                line-height: 28px;
                color: #ffffff;
                font-size: 14px;
                word-wrap: break-word;
                display: flex;
                justify-content: flex-start;
                i {
                  color: #e0efff;
                  margin-right: 10px;
                }
                span {
                  display: inline-block;
                  color: #e0efff;
                }
                .form-value {
                  word-wrap: break-word;
                  .email-li {
                    word-wrap: break-word;
                  }
                }
              }
            }
          }
          .msg {
            width: calc(100% - 152px);
            position: absolute;
            right: 0;
            bottom: 18px;
            .member-form {
              width: 100%;
              line-height: 28px;
              color: #ffffff;
              font-size: 14px;
              word-wrap: break-word;
              display: flex;
              justify-content: flex-start;
              i {
                color: #e0efff;
                margin-right: 10px;
              }
              span {
                display: inline-block;
                color: #e0efff;
              }
              .form-value {
                word-wrap: break-word;
                .email-li {
                  word-wrap: break-word;
                }
              }
            }
          }
        }
      }
    }
    .people-list {
      width: calc(100% - 80px);
      margin: auto;
      // margin-top: 20px;
      .people-li {
        margin: 8px 0;
        width: 100%;
        background: rgba(0, 149, 255, 0.06);
        padding: 16px;
        box-sizing: border-box;
        display: flex;
        flex-direction: row;
        justify-content: space-around;
        .img-box {
          width: 144px;
          img {
            background: #fff;
            width: 114px;
            // height: 141px;
          }
        }
        .people-detail {
          width: calc(100% - 152px);
          .name {
            font-size: 19px;
            font-weight: bold;
          }
          .people-msg {
            margin-top: 14px;
            font-size: 16px;
            font-weight: normal;
            line-height: 30px;
            color: #e0efff;
          }
          .email {
            font-size: 16px;
            margin-top: 14px;
            line-height: 30px;
          }
          .file {
            font-size: 16px;
            line-height: 30px;
            color: #0095ff;
          }
        }
      }
    }
    .join-content {
      width: calc(100% - 80px);
      margin: auto;
      .join-info {
        .join-slogan {
          font-size: 24px;
          font-weight: bold;
          color: #0095ff;
          text-align: center;
          margin: 20px 0;
          letter-spacing: 2px;
        }
        .join-intro {
          margin: 20px 0;
          p {
            font-size: 16px;
            line-height: 28px;
            color: #e0efff;
            margin-bottom: 16px;
            text-indent: 2em;
          }
        }
        .join-section {
          margin: 30px 0;
          h3 {
            font-size: 20px;
            font-weight: bold;
            color: #ffffff;
            margin-bottom: 16px;
            border-left: 4px solid #0095ff;
            padding-left: 12px;
          }
          h4 {
            font-size: 18px;
            font-weight: bold;
            color: #ffffff;
            margin: 20px 0 12px 0;
          }
          p {
            font-size: 16px;
            line-height: 28px;
            color: #e0efff;
            margin-bottom: 16px;
            text-indent: 2em;
          }
          ol {
            margin: 16px 0;
            padding-left: 40px;
            li {
              font-size: 16px;
              line-height: 28px;
              color: #e0efff;
              margin-bottom: 12px;
            }
          }
          .contact-info {
            background: rgba(0, 149, 255, 0.1);
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
            p {
              font-size: 16px;
              line-height: 28px;
              color: #e0efff;
              margin-bottom: 8px;
              text-indent: 0;
              strong {
                color: #ffffff;
              }
            }
          }
          .join-ending {
            font-size: 18px;
            font-weight: bold;
            color: #0095ff;
            text-align: left;
            margin: 20px 0;
            text-indent: 0;
          }
        }
      }
    }
  }
}
.team {
  // background: rgba(94, 116, 153, 0.19);
  width: 100%;
  height: 100%;
  padding: 8px;
  box-sizing: border-box;
  overflow-y: auto;
  display: flex;
}
.join-download-area {
  margin: 40px auto 0 auto;
  padding: 24px 0 0 0;
  border-top: 1px solid rgba(0, 149, 255, 0.15);
  .download-list {
    min-height: 90px;
    // display: flex;
    // flex-direction: row;
    // gap: 32px;
    // margin-bottom: 10px;
    .download-item {
      background: rgba(0, 149, 255, 0.06);
      border-radius: 8px;
      width: 300px;
      padding: 18px 22px;
      display: flex;
      align-items: center;
      min-width: 260px;
      margin-bottom: 6px;
      margin-right: 6px;
      float: left;
      .file-name {
        color: #fff;
        font-size: 17px;
        margin: 0 18px 0 12px;
        font-weight: 500;
      }
      .file-size {
        color: #b0cfff;
        font-size: 15px;
        margin-right: 18px;
      }
      .download-btn {
        margin-left: 8px;
        cursor: not-allowed;
      }
    }
  }
}
.download-arrow-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  margin-left: 12px;
  border-radius: 50%;
  background: none;
  border: none;
  cursor: pointer;
  transition: background 0.2s;
  text-decoration: none;
}
.download-arrow-btn:hover {
  background: rgba(26, 188, 156, 0.12);
}
.word-icon {
  width: 32px;
  height: 32px;
  margin-right: 8px;
  vertical-align: middle;
  display: inline-block;
}
</style>
