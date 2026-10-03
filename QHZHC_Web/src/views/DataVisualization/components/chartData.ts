type ChartParams = Record<string, any>;

export function getChart(params: ChartParams) {
  const normalizedParams: ChartParams = {
    ...params,
    data: Array.isArray(params && params.data) ? params.data : [],
  };
  if (
    normalizedParams.chartName === "CO2" ||
    normalizedParams.chartName === "CH4"
  ) {
    return lineChart(normalizedParams);
  } else if (normalizedParams.chartName === "windspeed") {
    return windChart(normalizedParams);
  } else if (normalizedParams.chartName === "realTime") {
    return realChart(normalizedParams);
  } else if (normalizedParams.chartName === "iCH4") {
    return methaneChart(normalizedParams);
  } else if (normalizedParams.chartName === "dayWeather") {
    return dayWeatherChart(normalizedParams);
  } else if (normalizedParams.chartName === "weekWeather") {
    return weekWeatherChart(normalizedParams);
  } else {
    return {};
  }
}

function lineChart(params: ChartParams) {
  const containerWidth = Number(params.containerWidth) || 480;
  const chartName = params.chartName;

  let data1 = [];
  let data2 = [];
  if (params.chartName === "CO2") {
    for (let gas of params.data) {
      if (
        gas.picarro_12co2_dry != null ||
        params.data.indexOf(gas) === 0 ||
        params.data.indexOf(gas) === params.data.length - 1
      ) {
        data1.push([gas.time, gas.picarro_12co2_dry]);
      }
      if (
        gas.pri_co2 != null ||
        params.data.indexOf(gas) === 0 ||
        params.data.indexOf(gas) === params.data.length - 1
      ) {
        data2.push([gas.time, gas.pri_co2]);
      }
    }
  } else if (params.chartName === "CH4") {
    for (let gas of params.data) {
      if (
        gas.picarro_hp_12ch4_dry != null ||
        params.data.indexOf(gas) === 0 ||
        params.data.indexOf(gas) === params.data.length - 1
      ) {
        // 低于12ppm使用gas.picarro_hp_12ch4_dry
        if (gas.picarro_hp_12ch4_dry < 12) {
          data1.push([gas.time, gas.picarro_hp_12ch4_dry]);
        } else {
          data1.push([gas.time, gas.picarro_hr_12ch4_dry]);
        }
      }
      if (
        gas.pri_ch4 != null ||
        params.data.indexOf(gas) === 0 ||
        params.data.indexOf(gas) === params.data.length - 1
      ) {
        data2.push([gas.time, gas.pri_ch4]);
      }
    }
  }
  const showLineSymbols = Math.max(data1.length, data2.length) <= 1;

  const option = {
    // 全局配置
    textStyle: {
      fontFamily: "Microsoft YaHei",
      color: "#FFFFFF",
      fontSize: 13,
    },
    grid: {
      show: true,
      containLabel: true,
      borderWidth: 0,
      top: "15%",
      right: "8%",
      left: "8%",
      bottom: "14%",
    },
    // title标题栏
    title: {
      text: `5分钟${chartName}数据`,
      left: "center",
      textStyle: {
        color: "#FFFFFF",
        fontSize: 12,
        fontWeight: 400,
      },
    },
    // XY轴
    xAxis: {
      type: "time",
      ...(params.timeWindow
        ? {
            min: params.timeWindow.start,
            max: params.timeWindow.end,
          }
        : {}),
      axisTick: {
        show: true,
        inside: true, //刻度内置
      },
      axisLine: {
        show: true,
        symbol: ["none", "arrow"], //加箭头处
      },
      axisLabel: {
        hideOverlap: true,
        rotate: -30,
        margin: 14,
        fontSize: 11,
        formatter: {
          year: "{yyyy}",
          month: "{MMM}",
          day: "{dayStyle|{yyyy}-{MM}-{dd}}",
          hour: "{hourStyle|{HH}:{mm}}",
          minute: "{HH}:{mm}",
          second: "{secondStyle|{ss}s}",
        },
        rich: {
          dayStyle: {
            // 让年度信息更醒目
            color: "yellow",
            fontWeight: "bold",
          },
          hourStyle: {
            // 让年度信息更醒目
            color: "#FFFFFF",
            fontWeight: "bold",
          },
          secondStyle: {
            // 让年度信息更醒目
            color: "#999",
          },
        },
      },
    },
    yAxis: {
      type: "value",
      name: `${chartName}(ppm)`,
      min: function (value: any) {
        return parseInt(value.min);
      },
      splitLine: {
        lineStyle: {
          type: "dashed",
          opacity: "0.3",
        },
      },
      axisLine: {
        show: true,
        symbol: ["none", "arrow"], //加箭头处
      },
      axisLabel: {
        fontSize: 13,
      },
    },
    //数据系列
    series: [
      {
        name: "Picarro",
        type: "line",
        data: data1,
        smooth: true,
        showSymbol: showLineSymbols,
        symbolSize: 6,
        connectNulls: true,
        itemStyle: {
          color: "#FAC858",
        },
        lineStyle: {
          color: "#FAC858",
        },
      },
      {
        name: "PRI",
        type: "line",
        data: data2,
        smooth: true,
        showSymbol: showLineSymbols,
        symbolSize: 6,
        connectNulls: true,
        itemStyle: {
          color: "#12FF9B",
        },
        lineStyle: {
          color: "#12FF9B",
        },
      },
    ],
    //legend图例
    legend: {
      show: true,
      width: "35%",
      right: "5%",
      itemGap: 0,
      itemWidth: containerWidth * 0.05,
      itemHeight: containerWidth * 0.04,
      textStyle: {
        color: "#FFFFFF",
      },
    },
    //tooltip提示框
    tooltip: {
      show: true,
      trigger: "axis",
      backgroundColor: "rgb(8, 14, 25)",
      textStyle: {
        color: "#FFFFFF",
        fontSize: 13,
      },
      axisPointer: {
        type: "cross",
        label: {
          backgroundColor: "rgb(8, 14, 25)",
          borderWidth: 1,
          borderColor: "#FFFFFF",
        },
      },
    },
  };
  if (params.isIntialization) {
    return option;
  } else {
    return {
      series: [{ data: data1 }, { data: data2 }],
    };
  }
}

function windChart(params: ChartParams) {
  let wind_Z = 0;
  let data1 = [];
  let data2 = [];
  let data3 = [];
  let data4 = [];
  let data5 = [];

  for (let gas of params.data) {
    const rawValues = [gas.wind_speed, gas.wind_direction, gas.pri_ch4];
    if (
      rawValues.some(
        (value) => value === null || value === undefined || value === "",
      )
    ) {
      continue;
    }

    const windSpeed = Number(gas.wind_speed);
    const windDirection = Number(gas.wind_direction);
    const concentration = Number(gas.pri_ch4);
    if (
      !Number.isFinite(windSpeed) ||
      !Number.isFinite(windDirection) ||
      !Number.isFinite(concentration)
    ) {
      continue;
    }

    const point = [windSpeed, windDirection, concentration, gas.time];
    if (concentration >= 1.8 && concentration <= 2) {
      data1.push(point);
    } else if (concentration > 2 && concentration <= 2.5) {
      data2.push(point);
    } else if (concentration > 2.5 && concentration <= 5) {
      data3.push(point);
    } else if (concentration > 5 && concentration <= 10) {
      data4.push(point);
    } else if (concentration > 10) {
      data5.push(point);
    }
    wind_Z = windSpeed;
  }

  // const option = {
  //   // 全局配置
  //   textStyle: {
  //     fontFamily: "Microsoft YaHei",
  //     color: "#FFFFFF",
  //   },
  //   grid: {
  //     show: true,
  //     borderWidth: 1,
  //     right: "15%",
  //     left: "5%",
  //     top: "10%",
  //     bottom: "5%",
  //     borderColor: "#363D4B",
  //     containLabel: true,
  //   },
  //   // title标题栏
  //   title: [
  //     {
  //       text: `5分钟时长`,
  //       left: "10%",
  //       textStyle: {
  //         fontSize: 12,
  //         fontWeight: 500,
  //         color: "#FFFFFF",
  //       },
  //     },
  //     {
  //       text: `W=${wind_Z} m/s`,
  //       right: "15%",
  //       textStyle: {
  //         fontSize: 12,
  //         fontWeight: 500,
  //         color: "#FFFFFF",
  //       },
  //     },
  //     {
  //       text: `CH4(ppm)`,
  //       top: "5%",
  //       right: "0%",
  //       textStyle: {
  //         fontSize: 10,
  //         fontWeight: 400,
  //         color: "#FFFFFF",
  //       },
  //     },
  //   ],
  //   // XY轴
  //   xAxis: {
  //     type: "value",
  //     name: "E",
  //     axisTick: {
  //       show: false,
  //     },
  //     axisLabel: {
  //       show: false,
  //     },
  //     axisLine: {
  //       symbol: ["none", "arrow"],
  //       lineStyle: {
  //         color: "#EEE8AA",
  //       },
  //     },
  //     splitLine: {
  //       show: false,
  //     },
  //   },
  //   yAxis: {
  //     type: "value",
  //     name: "N",
  //     axisTick: {
  //       show: false,
  //     },
  //     axisLabel: {
  //       show: false,
  //     },
  //     axisLine: {
  //       symbol: ["none", "arrow"],
  //       lineStyle: {
  //         color: "#6495ED",
  //       },
  //     },
  //     splitLine: {
  //       show: false,
  //     },
  //   },
  //   //数据系列
  //   series: [
  //     {
  //       name: "1.8-2",
  //       type: "scatter",
  //       data: data1,
  //       smooth: true,
  //       symbolSize: 8,
  //       itemStyle: {
  //         color: "red",
  //       },
  //     },
  //     {
  //       name: "2-2.5",
  //       type: "scatter",
  //       data: data2,
  //       symbolSize: 8,
  //       smooth: true,
  //       itemStyle: {
  //         color: "#FFC000",
  //       },
  //     },
  //     {
  //       name: "2.5-5",
  //       type: "scatter",
  //       data: data3,
  //       smooth: true,
  //       symbolSize: 8,
  //       itemStyle: {
  //         color: "#FFFF00",
  //       },
  //     },
  //     {
  //       name: "5-10",
  //       type: "scatter",
  //       data: data4,
  //       smooth: true,
  //       symbolSize: 8,
  //       itemStyle: {
  //         color: "#2F5597",
  //       },
  //     },
  //     {
  //       name: ">10",
  //       type: "scatter",
  //       data: data5,
  //       smooth: true,
  //       symbolSize: 8,
  //       itemStyle: {
  //         color: "#0000FF",
  //       },
  //     },
  //   ],
  //   //legend
  //   legend: {
  //     orient: "vertical",
  //     right: 0,
  //     top: "12%",
  //     itemHeight: containerWidth * 0.025,
  //     textStyle: {
  //       fontSize: containerWidth * 0.025,
  //       color: "#FFFFFF",
  //     },
  //   },
  //   //tooltip提示框
  //   tooltip: {
  //     show: true,
  //     trigger: "axis",
  //     backgroundColor: "rgb(8, 14, 25)",
  //     textStyle: {
  //       color: "#FFFFFF",
  //       fontSize: 13,
  //     },
  //     axisPointer: {
  //       type: "cross",
  //       label: {
  //         backgroundColor: "rgb(8, 14, 25)",
  //         borderWidth: 1,
  //         borderColor: "#FFFFFF",
  //       },
  //     },
  //   },
  // };
  const option = {
    title: [
      {
        text: `5分钟时长`,
        // subtext: '虚构数据',
        x: "left",
        textStyle: {
          fontSize: 12,
          fontWeight: 500,
          color: "#FFFFFF",
        },
      },
      {
        text: `W=${wind_Z.toFixed(2)} m/s`,
        right: "15%",
        textStyle: {
          fontSize: 12,
          fontWeight: 500,
          color: "#FFFFFF",
        },
      },
    ],
    tooltip: {
      // trigger: 'axis',
      formatter: function (params: any) {
        var value = params.value;
        const xname = value[3];
        let str = `${xname}<br>`;

        str += `${params.marker}${params.seriesName.split("(")[0]}：
          ${params.value[2]}ppm<br>`;

        return str;

        //   // return '<div style="border-bottom: 1px solid rgba(255,255,255,.3); font-size: 18px;padding-bottom: 7px;margin-bottom: 7px">'
        //   // 	+ obj.seriesName + ' ' + value[0] + '日：'
        //   // 	+ value[7]
        //   // 	+ '</div>'
        //   // 	+ schema[1].text + '：' + value[1] + '<br>'
        //   // 	+ schema[2].text + '：' + value[2] + '<br>'
        //   // 	+ schema[3].text + '：' + value[3] + '<br>'
        //   // 	+ schema[4].text + '：' + value[4] + '<br>'
        //   // 	+ schema[5].text + '：' + value[5] + '<br>'
        //   // 	+ schema[6].text + '：' + value[6] + '<br>';
      },
    },
    angleAxis: {
      min: 0,
      max: 360,
      z: 0,
      boundaryGap: false,
      splitLine: {
        show: true,
        lineStyle: {
          color: "#ddd",
          type: "solid",
        },
      },
      axisLine: {
        show: false,
      },
    },
    radiusAxis: {
      type: "value",
      center: ["50%", "50%"],
      axisLine: {
        show: false,
        lineStyle: {
          color: "#6495ED",
          type: "dashed",
        },
      },
      splitLine: {
        show: true,
        lineStyle: {
          type: "dashed",
        },
      },
    },
    grid: {
      // 控制图的大小，调整下面这些值就可以，
      x: 40,
      x2: 100,
      y2: 150, // y2可以控制 X轴跟Zoom控件之间的间隔，避免以为倾斜后造成 label重叠到zoom上
    },
    polar: {},
    series: [
      {
        // type: 'bar',
        type: "scatter",
        data: data1,
        coordinateSystem: "polar",
        name: "1.8-2",
        stack: "a",
        symbolSize: 8,
        itemStyle: {
          // color: 'rgb(124, 181, 236)'
          color: "#0000FF",
        },
      },
      {
        // type: 'bar',
        type: "scatter",
        data: data2,
        coordinateSystem: "polar",
        name: "2-2.5",
        stack: "a",
        itemStyle: {
          // color: 'rgb(124, 181, 236)'
          color: "#2F5597",
        },
      },
      {
        // type: 'bar',
        type: "scatter",
        data: data3,
        coordinateSystem: "polar",
        name: "2.5-5",
        stack: "a",
        itemStyle: {
          // color: 'rgb(124, 181, 236)'
          color: "#FFFF00",
        },
      },

      {
        // type: 'bar',
        type: "scatter",
        data: data4,
        coordinateSystem: "polar",
        name: "5-10",
        stack: "a",
        itemStyle: {
          color: "#FFC000",
        },
      },
      {
        // type: 'bar',
        type: "scatter",
        data: data5,
        coordinateSystem: "polar",
        name: ">10",
        stack: "a",
        itemStyle: {
          color: "red",
        },
      },
    ],
    legend: {
      show: true,
      top: "10%",
      right: "right",
      data: ["1.8-2", "2-2.5", "2.5-5", "5-10", ">10"],
      orient: "vertical",
      textStyle: {
        fontSize: 12,
        color: "#FFFFFF",
      },
    },
  };
  if (params.isIntialization) {
    return option;
  } else {
    return {
      title: [{}, { text: `W=${wind_Z.toFixed(2)} m/s` }, {}],
      series: [
        {
          data: data1,
        },
        {
          data: data2,
        },
        {
          data: data3,
        },
        {
          data: data4,
        },
        {
          data: data5,
        },
      ],
    };
  }
}

function realChart(params: ChartParams) {
  const containerWidth = params.containerWidth;
  let dataX1 = ["CH4", "C2H6"];
  let dataX2 = ["CO2", "CO"];
  let dataY1 = [];
  let dataY2 = [];
  let data1 = 0; //Radio=C2H6/CH4
  let data2 = 0; //Radio=CO/CO2

  if (params.data.length > 0) {
    let gas = params.data[params.data.length - 1];
    dataY1.push(gas.pri_ch4 ? gas.pri_ch4 : 0);
    dataY1.push(gas.pri_c2h6 ? gas.pri_c2h6 : 0);
    dataY2.push(gas.pri_co2 ? gas.pri_co2 : 0);
    dataY2.push(gas.pri_co ? gas.pri_co : 0);
    if (dataY1[0] != 0) {
      data1 = dataY1[1] / dataY1[0];
    }
    if (dataY2[0] != 0) {
      data2 = dataY2[1] / dataY2[0];
    }
  }

  const option = {
    // 全局配置
    graphic: [
      {
        type: "rect",
        left: "1%",
        top: "10%",
        shape: {
          width: containerWidth * 0.48,
          height: 600,
          r: [containerWidth * 0.1, containerWidth * 0.1, 0, 0],
        },
        style: {
          fill: {
            type: "linear", //线性渐变
            x1: 0,
            y1: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              {
                offset: 1,
                color: "rgba(00,149,255,0.25)",
              },
              {
                offset: 0,
                color: "rgba(00,149,255,0)",
              },
            ],
          },
        },
        z: -10,
      },
      {
        type: "rect",
        right: "1%",
        top: "10%",
        shape: {
          width: containerWidth * 0.48,
          height: 600,
          r: [containerWidth * 0.1, containerWidth * 0.1, 0, 0],
        },
        style: {
          fill: {
            type: "linear", //线性渐变
            x1: 0,
            y1: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              {
                offset: 1,
                color: "rgba(255,255,255,0.25)",
              },
              {
                offset: 0,
                color: "rgba(255,255,255,0)",
              },
            ],
          },
        },
        z: -10,
      },
    ],

    textStyle: {
      fontFamily: "Microsoft YaHei",
      color: "#FFFFFF",
    },
    grid: [
      {
        opacity: 0.3,
        show: true,
        borderWidth: 0,
        width: "40%",
        bottom: "5%",
        top: "20%",
        left: "5%",
        containLabel: true,
      },
      {
        opacity: 0.3,
        show: true,
        borderWidth: 0,
        width: "40%",
        top: "20%",
        bottom: "5%",
        right: "5%",
        containLabel: true,
      },
    ],
    // title标题栏
    title: [
      {
        // text: `Radio=C2H6/CH4`,
        text: `C2H6/CH4=` + data1.toFixed(2),
        left: "15%",
        textStyle: {
          color: "#FFFFFF",
          fontWeight: 500,
          fontSize: 12,
        },
      },
      {
        // text: `Radio=CO/CO2`,
        text: `CO/CO2=` + data2.toFixed(2),
        right: "15%",
        textStyle: {
          color: "#FFFFFF",
          fontSize: 12,
          fontWeight: 500,
        },
      },
    ],
    // XY轴
    xAxis: [
      {
        type: "category",
        data: dataX1,
        axisTick: {
          show: false,
        },
        axisLabel: {
          fontWeight: 700,
        },
      },
      {
        gridIndex: 1,
        type: "category",
        data: dataX2,
        axisTick: {
          show: false,
        },
        axisLabel: {
          fontWeight: 700,
        },
      },
    ],
    yAxis: [
      {
        name: "Conc(ppm)",
        type: "value",
        axisLine: { show: true },
        splitLine: {
          lineStyle: {
            type: "dashed",
            opacity: "0.3",
          },
        },
      },
      {
        gridIndex: 1,
        name: "Conc(ppm)",
        type: "value",
        axisLine: { show: true },
        splitLine: {
          lineStyle: {
            type: "dashed",
            opacity: "0.3",
          },
        },
      },
    ],
    //数据系列
    series: [
      {
        name: "C2H6/CH4",
        type: "bar",
        data: dataY1,
        smooth: true,
        showSymbol: false,
        itemStyle: {
          borderRadius: [100, 100, 0, 0],
          color: function (params: any) {
            if (params.dataIndex == 0) {
              return {
                type: "line",
                x1: 0,
                y1: 0,
                x2: 1,
                y2: 1,
                colorStops: [
                  {
                    offset: 0,
                    color: "#12FF98",
                  },
                  {
                    offset: 1,
                    color: "#94FFFF",
                  },
                ],
              };
            } else {
              return {
                type: "line",
                x1: 0,
                y1: 0,
                x2: 1,
                y2: 1,
                colorStops: [
                  {
                    offset: 0,
                    color: "#FAC858",
                  },
                  {
                    offset: 1,
                    color: "#FF9634",
                  },
                ],
              };
            }
          },
        },
        label: {
          show: true,
          position: "top",
          color: "#FFFFFF",
          textBorderWidth: 0,
          formatter: function (param: any) {
            var str = param.data;
            return parseFloat(str).toFixed(2);
          },
        },
      },
      {
        name: "CO/CO2",
        type: "bar",

        itemStyle: {
          borderRadius: [100, 100, 0, 0],
          color: function (params: any) {
            if (params.dataIndex == 0) {
              return {
                type: "line",
                x1: 0,
                y1: 0,
                x2: 1,
                y2: 1,
                colorStops: [
                  {
                    offset: 0,
                    color: "#12FF98",
                  },
                  {
                    offset: 1,
                    color: "#94FFFF",
                  },
                ],
              };
            } else {
              return {
                type: "line",
                x1: 0,
                y1: 0,
                x2: 1,
                y2: 1,
                colorStops: [
                  {
                    offset: 0,
                    color: "#FAC858",
                  },
                  {
                    offset: 1,
                    color: "#FF9634",
                  },
                ],
              };
            }
          },
        },
        label: {
          show: true,
          position: "top",
          color: "#FFFFFF",
          textBorderWidth: 0,
          formatter:
            // "{ parseFloat(c).toFixed(2)}",
            function (param: any) {
              var str = param.data;
              if (param.name == "CO2") {
                return parseFloat(str).toFixed(1);
              } else {
                return parseFloat(str).toFixed(2);
              }
            },
        },
        data: dataY2,
        smooth: true,
        showSymbol: false,
        xAxisIndex: 1,
        yAxisIndex: 1,
      },
    ],

    //tooltip提示框
    tooltip: {
      show: true,
      trigger: "axis",
      backgroundColor: "rgb(8, 14, 25)",
      textStyle: {
        color: "#FFFFFF",
        fontSize: 13,
      },
      axisPointer: {
        type: "cross",
        label: {
          backgroundColor: "rgb(8, 14, 25)",
          borderWidth: 1,
          borderColor: "#FFFFFF",
        },
      },
    },
  };
  if (params.isIntialization) {
    return option;
  } else {
    return {
      title: [
        {
          // text: `Radio=C2H6/CH4`,
          text: `C2H6/CH4=` + data1.toFixed(5),
        },
        {
          // text: `Radio=CO/CO2`,
          text: `CO/CO2=` + data2.toFixed(5),
        },
      ],
      series: [
        {
          data: dataY1,
        },
        {
          data: dataY2,
        },
      ],
    };
  }
}

function methaneChart(params: ChartParams) {
  let data = [];
  for (let gas of params.data) {
    if (
      gas.picarro_delta_ich4_raw != null ||
      params.data.indexOf(gas) === 0 ||
      params.data.indexOf(gas) === params.data.length - 1
    ) {
      data.push([gas.time, gas.picarro_delta_ich4_raw]);
    }
  }
  const option = {
    // 全局配置
    textStyle: {
      fontFamily: "Microsoft YaHei",
      color: "#FFFFFF",
    },
    grid: {
      show: true,
      borderWidth: 0,
      containLabel: true,
      right: "5%",
      left: "12%",
      bottom: "12%",
      top: "20%",
    },
    // title标题栏
    title: {
      text: `5分钟甲烷同位素数据`,
      left: "center",
      textStyle: {
        color: "#FFFFFF",
        fontWeight: 400,
        fontSize: 12,
      },
    },
    // XY轴
    xAxis: {
      type: "time",
      ...(params.timeWindow
        ? {
            min: params.timeWindow.start,
            max: params.timeWindow.end,
          }
        : {}),
      axisLabel: {
        formatter: {
          year: "{yyyy}",
          month: "{MMM}",
          day: "{dayStyle|{yyyy}-{MM}-{dd}}",
          hour: "{hourStyle|{HH}:{mm}}",
          minute: "{HH}:{mm}",
          second: "{secondStyle|{ss}s}",
        },
        rich: {
          dayStyle: {
            // 让年度信息更醒目
            color: "yellow",
            fontWeight: "bold",
          },
          hourStyle: {
            // 让年度信息更醒目
            color: "#FFFFFF",
            fontWeight: "bold",
          },
          secondStyle: {
            // 让年度信息更醒目
            color: "#999",
          },
        },
      },
      axisTick: {
        show: false,
      },
    },
    yAxis: {
      name: "δ13CH4（‰）",
      type: "value",
      splitLine: {
        lineStyle: {
          type: "dashed",
          opacity: "0.3",
        },
      },
      axisLine: {
        show: true,
      },
      axisLabel: {
        fontSize: 11,
      },
    },
    //数据系列
    series: [
      {
        type: "bar",
        data: data,
        smooth: true,
        showSymbol: false,
        barCategoryGap: "0",
        itemStyle: {
          color: {
            type: "line",
            x1: 0,
            y1: 0,
            x2: 1,
            y2: 1,
            colorStops: [
              {
                offset: 0,
                color: "#0CE88B",
              },
              {
                offset: 1,
                color: "rgb(76,239,246,0)",
              },
            ],
          },
        },
      },
    ],

    //tooltip提示框
    tooltip: {
      show: true,
      trigger: "axis",
      backgroundColor: "rgb(8, 14, 25)",
      textStyle: {
        color: "#FFFFFF",
        fontSize: 13,
      },
      axisPointer: {
        type: "cross",
        label: {
          backgroundColor: "rgb(8, 14, 25)",
          borderWidth: 1,
          borderColor: "#FFFFFF",
        },
      },
    },
  };
  if (params.isIntialization) {
    return option;
  } else {
    return {
      series: {
        data: data,
      },
    };
  }
}
/** 24z小时图表 */
function dayWeatherChart(params: ChartParams) {
  let count = 0;
  let dataY = [];

  for (; count < params.data.length; count++) {
    dataY.push([params.data[count].fxTime, params.data[count].temp]);
  }

  const option = {
    // 全局配置
    /** 
    backgroundColor:{
         type: 'radial', //线性渐变
          r: 0.5,
          x: 0.5, //渐变起始位置
          y: 0.9, 
          colorStops: [
            {
              offset: 1, color: "rgba(8, 14, 25)",
            },
            {
              offset: 0, color: "rgba(8, 14, 25,0.85)", 
            }],
      },
    */
    textStyle: {
      fontFamily: "Microsoft YaHei",
      color: "#FFFFFF",
    },
    grid: {
      show: true,
      borderWidth: 0,
      right: "2%",
      left: "2%",
      bottom: "0%",
      top: "30%",
    },
    // title标题栏
    title: {
      left: "center",
      textStyle: {
        color: "#FFFFFF",
        fontWeight: 400,
      },
    },
    // XY轴
    xAxis: {
      type: "time",
      boundaryGap: false,
      axisLabel: {
        show: true,
      },
      axisTick: {
        show: true,
      },
    },
    yAxis: {
      type: "value",
      axisLabel: {
        show: false,
      },
      axisTick: {
        show: false,
      },
      splitLine: {
        show: false,
      },
    },
    //tooltip提示框
    tooltip: {
      show: true,
      trigger: "axis",
      backgroundColor: "rgb(8, 14, 25)",
      textStyle: {
        color: "#FFFFFF",
        fontSize: 13,
      },
      // axisPointer: {
      //   type: "cross",
      //   label: {
      //     backgroundColor: "rgb(8, 14, 25)",
      //     borderWidth: 1,
      //     borderColor: "#FFFFFF",
      //   },
      // },
    },
    //数据系列
    series: [
      {
        name: "temp",
        type: "line",
        data: dataY,
        smooth: true,
        symbolSize: 6,
        label: {
          show: true,
          fontSize: 12,
          color: "#FFFFFF",
          position: "bottom",
          formatter: function (value: any) {
            return value.value[1] + "℃";
          },
        },
        itemStyle: {
          color: "#0095FF",
        },
        lineStyle: {
          color: "#0095FF",
          width: 1,
        },
        areaStyle: {
          color: {
            x1: 0,
            y1: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              {
                offset: 0,
                color: "rgba(96,231,255,0.33)",
              },
              {
                offset: 1,
                color: "rgba(8,14,25,0)",
              },
            ],
          },
        },
      },
    ],
  };
  return option;
}

/** 七天天气图表 */
function weekWeatherChart(params: ChartParams) {
  let count = 0;
  let dataY1 = [];
  let dataY2 = [];
  for (; count < params.data.length; count++) {
    dataY1.push([params.data[count].fxDate, params.data[count].tempMax]);
    dataY2.push([params.data[count].fxDate, params.data[count].tempMin]);
  }

  const option = {
    // 全局配置
    textStyle: {
      fontFamily: "Microsoft YaHei",
      color: "#FFFFFF",
    },
    grid: {
      show: true,
      borderWidth: 0,
      right: "8%",
      left: "8%",
      bottom: "20",
      top: "30%",
    },

    // XY轴
    xAxis: {
      type: "time",
      boundaryGap: false,
      axisLabel: {
        show: false,
      },
      axisTick: {
        show: false,
      },
      axisLine: {
        show: false,
      },
    },
    yAxis: {
      type: "value",
      // min: weekTempMin - 3,
      function(value: any) {
        return parseInt(value.min);
      },
      axisLabel: {
        show: false,
      },
      axisTick: {
        show: false,
      },
      splitLine: {
        show: false,
      },
    },
    //tooltip提示框
    tooltip: {
      show: true,
      trigger: "axis",
      backgroundColor: "rgb(8, 14, 25)",
      textStyle: {
        color: "#FFFFFF",
        fontSize: 13,
      },
      // axisPointer: {
      //   type: "cross",
      //   label: {
      //     backgroundColor: "rgb(8, 14, 25)",
      //     borderWidth: 1,
      //     borderColor: "#FFFFFF",
      //   },
      // },
    },
    //数据系列
    series: [
      {
        name: "最高温",
        type: "line",
        data: dataY1,
        smooth: true,
        symbolSize: 6,
        label: {
          show: true,
          fontSize: 12,
          color: "#FFFFFF",
          position: "top",
          formatter: function (value: any) {
            return value.value[1] + "℃";
          },
        },
        itemStyle: {
          color: "#ff9900",
        },
        lineStyle: {
          color: "#ff9900",
          width: 1,
        },
        areaStyle: {
          color: {
            x1: 0,
            y1: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              {
                offset: 0,
                color: "rgba(255,153,0,0.5)",
              },
              {
                offset: 1,
                color: "rgba(255,153,0,0)",
              },
            ],
          },
        },
      },
      {
        name: "最低温",
        type: "line",
        data: dataY2,
        smooth: true,
        symbolSize: 6,
        label: {
          show: true,
          position: "bottom",
          fontSize: 12,
          color: "#FFFFFF",
          formatter: function (value: any) {
            return value.value[1] + "℃";
          },
        },
        itemStyle: {
          color: "#0095FF",
        },
        lineStyle: {
          color: "#0095FF",
          width: 1,
        },
        areaStyle: {
          color: {
            x1: 0,
            y1: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              {
                offset: 0,
                color: "rgba(96,231,255)",
              },
              {
                offset: 1,
                color: "rgba(8,14,25,0)",
              },
            ],
          },
        },
      },
    ],
  };
  return option;
}
