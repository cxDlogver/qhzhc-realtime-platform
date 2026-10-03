export class CesiumMove {
  /**
   * @description: 模型运动
   * @param {viewer,cesium,data,glbName} arg
   * @return {*}
   */
  constructor(arg) {
    this.viewer = arg.viewer;
    this.Cesium = arg.cesium;
    this.id = arg.id || null;
    this.name = arg.name || "model";
    this.data = arg.data || null;
    this.glbName = arg.glbName || null;
    // 起始时间
    this.start = this.Cesium.JulianDate.fromDate(new Date(2023, 2, 6));
    // 结束时间
    this.stop = this.Cesium.JulianDate.addSeconds(
      this.start,
      30,
      new this.Cesium.JulianDate()
    ); //这里的30表示单次循环的时间，可以根据传入参数data对象中的time属性值的最大时间做调整
  }
  move() {
    // 设置始时钟始时间
    this.viewer.clock.startTime = this.start.clone();
    // 设置时钟当前时间
    this.viewer.clock.currentTime = this.start.clone();
    // 设置始终停止时间
    this.viewer.clock.stopTime = this.stop.clone();
    // 时间速率，数字越大时间过的越快
    this.viewer.clock.multiplier = 2;
    // 时间轴
    this.viewer.timeline.zoomTo(this.start, this.stop);
    // 循环执行,即为2，到达终止时间，重新从起点时间开始
    this.viewer.clock.clockRange = this.Cesium.ClockRange.LOOP_STOP;

    let property = this.computeTrack(this.data);
    //console.log(property)
    // let modelPath = "../glb/" + this.glbName + ".glb";
    let modelPath = "/glb/Cesium_Car.glb";

    // 添加模型
    this.viewer.entities.add({
      name: modelPath,
      // 和时间轴关联
      availability: new this.Cesium.TimeIntervalCollection([
        new this.Cesium.TimeInterval({
          start: this.start,
          stop: this.stop,
        }),
      ]),
      position: property,
      // 根据所提供的速度计算模型的朝向
      orientation: new this.Cesium.VelocityOrientationProperty(property),
      // 模型数据
      model: {
        id: this.id,
        name: this.name,
        uri: modelPath,
        scale: 0.001,
      },
    });
  }

  /**
   * 计算飞行
   * @param source 数据坐标
   * @returns {SampledPositionProperty|*}
   */
  computeTrack(source) {
    // 取样位置 相当于一个集合
    let property = new this.Cesium.SampledPositionProperty();
    for (let i = 0; i < source.length; i++) {
      let time = this.Cesium.JulianDate.addSeconds(
        this.start,
        source[i].time,
        new this.Cesium.JulianDate()
      );
      let position = this.Cesium.Cartesian3.fromDegrees(
        source[i].longitude,
        source[i].latitude,
        source[i].height
      );
      // 添加位置，和时间对应
      property.addSample(time, position);
    }
    return property;
  }
}
