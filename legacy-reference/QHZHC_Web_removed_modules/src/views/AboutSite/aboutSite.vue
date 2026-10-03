<template>
    <div class="website">
        <div class="content">
            <div class="title">温室气体监测和计量平台介绍</div>
            <div class="detail-msg">
                温室气体监测和计量平台由清华大学鲁玺教授领导的CarbonScope团队开发，旨在通过多源数据融合与多种监测技术的结合，实现温室气体排放的精准监测、核算与溯源。平台通过集成多种先进仪器设备，整合了地面走航监测、无人机测绘、卫星遥感、碳通量监测等多种技术手段，实现了全天候、跨区域、多源数据融合的实时交互。平台具备监测-分析-报告-核查的协同能力，可广泛应用于区域排放监测、排放源量化与溯源、生态系统研究、政策支持与评估等多个领域。
            </div>
            <div class="section">
                <div class="section-title">一、平台的核心功能包括：</div>
                <div class="section-msg">
                    <p>1.多源数据融合：<span>结合地面走航、无人机、卫星等监测手段，实现温室气体排放的全方位监测。</span></p>
                    <p>2.实时交互平台：<span>支持不同地图类型、气体种类切换，提供实时污染分布地图、气象预报、气体协同分析等功能。</span></p>
                    <p>3.精准溯源与核算：<span>通过高斯扩散模型、贝叶斯后验模拟等方法，实现温室气体排放源的精准定位与量化。</span></p>
                    <p>4.碳通量监测：<span>采用微气象学方法，测量地表与大气之间的物质与能量交换通量。</span></p>
                </div>
                <div class="section-title">二、平台功能与应用场景</div>
                <div class="section-msg">
                    <p>（1）区域与园区监测：<span>通过地面走航和无人机监测，快速筛查和定位温室气体排放源，适用于工业园区、矿区、垃圾填埋场等场景。</span></p>
                    <p>（2）大气背景监测：<span>结合卫星遥感和固定站点，监测区域温室气体浓度背景值，为排放核算提供基础数据。</span></p>
                    <p>（3）排放源定位与量化：<span>利用高斯扩散模型、贝叶斯后验模拟等方法，结合走航监测数据，精准定位排放源并估算排放量。</span></p>
                    <p>（4）泄漏检测：<span>通过红外成像仪和无人机测绘系统，快速检测气体泄漏点，为快速响应温室气体泄漏事故，提供泄漏源定位、泄漏量估算和扩散模拟支持。</span></p>
                    <p>（5）生态系统碳通量研究：<span>利用涡动相关系统，测量生态系统与大气之间的碳通量、水汽交换，研究生态系统碳汇功能。</span></p>
                    <p>（6）农业与湿地排放监测：<span>监测水稻田、湿地等生态系统中的温室气体排放，评估生态系统的碳源-碳汇特征。</span></p>
                    <p>（7）排放清单校验：<span>结合自上而下和自下而上的方法，校验国家和区域温室气体排放清单，为政策制定提供科学依据。</span></p>
                    <p>（8）减排效果评估：<span>通过长期监测和模拟分析，对园区或者场站评估减排措施的实施效果。</span></p>
                </div>

            </div>
        </div>
    </div>
</template>
<script>
export default {
    data() {
        return {}
    }
}
</script>
<style lang="scss" scoped>
.website {
    background: rgba(94, 116, 153, 0.19);
    width: 100%;
    height: 100%;
    overflow-y: auto;
    padding: 8px;
    box-sizing: border-box;
    .content {
        width: 90%;
        margin: auto;
        font-family: 'Microsoft YaHei';
        .title {
            font-size: 20px;
            font-weight: bold;
            line-height: 58px;
            margin-top: 16px;
        }
        .detail-msg {
            text-indent: 2em;
            font-size: 16px;
            font-weight: normal;
            line-height: 28px;
            color: #E0EFFF;
        }
        .section {
            .section-title {
                font-size: 17px;
                font-weight: bold;
                line-height: 58px;
                color: #ffffff;
                margin-top: 16px;
            }
            .section-msg {
                background: rgba(0, 149, 255, 0.06);
                padding: 20px;
                margin-bottom: 8px;
                p {
                    // height: 38px;
                    line-height: 38px;
                    font-size: 16px;
                    word-wrap: break-word;
                    word-break: break-all;
                    span {
                        color: #E0EFFF;
                    }
                }
            }
        }
    }
}
</style>