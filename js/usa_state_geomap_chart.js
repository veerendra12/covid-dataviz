const ANIMATION_INTERVAL = 40;
const EVENT_PAUSE_INTERVAL = 4000;
const ONE_DAY = 60 * 60 * 24 * 1000;

const DATA_USMAP_TOPJSON = "data/counties-albers-10m.json";
const DATA_STATE_CODES = "data/state_codes.csv";
const DATA_STATE_CONFIRMED_CASES = "data/usa_state_covid_confirmed_cases_stats.csv";
const DATA_STATE_CONFIRMED_CASE_EVENTS = "data/usa_state_confirmed_cases_events.json";
const DATA_STATE_DEATHS = "data/usa_state_covid_deaths_stats.csv";
const DATA_STATE_DEATHS_ROLLING_AVG_EVENTS = "data/usa_state_deaths_rolling_avg_events.json";
const DATA_STATE_COLORS = "data/state-colors.json";
const DATA_CORONA_SVG = "data/corona_svg.json";
const DATA_IDS = "data/Ids.json";

var Dims = {
    MainSvg : {
        Width: -1,
        Height: -1
    },
    MainSvgChart : {
        Width: -1,
        Height: -1       
    },
    LegendChart : {
        Width : -1,
        Height : 120
    },
    EventsChart : {
        Width : 450,
        Height : 800
    },
    Margin : {
        Top: 100, 
        Bottom: 50, 
        Left: 50, 
        Right: 50
    },
    NavigationBox : {
        Width: 140,
        Height: 20
    }
};

var Scales = {};
var Generators = {};

var SVG_HEIGHT = "800";
var MARGIN = { Top: 50, Bottom: 50, Left: 25, Right: 50 };

var timeParser = d3.timeParse("%m/%d/%y");
var timeFormatter = d3.timeFormat("%m/%d/%y");
var dateMonthTimeFormatter = d3.timeFormat("%d %b");
var timeFormatterHyphen = d3.timeFormat("%m-%d-%y");

var totalTimeLineRange = [timeParser("01/01/20"), timeParser("07/22/20")];
var totalTimeLineNumDays = (totalTimeLineRange[1] - totalTimeLineRange[0]) / ONE_DAY + 1;

var IDs;
var timer;
var geoJson;

// var projection = d3.geoEquirectangular()
//                     .scale(400)
//                     .center([-100, 30])
//                     .translate([480, 250]);
var geoPath = d3.geoPath();

var countyFeaturesMap = {};
var stateFeaturesMap = {};
var populationDataFormatted = [];
var dataUSTopJson;
var minPopulation;
var maxPopulation;
var stateCodes;
var dataDatewiseStateCases;
var dataStateEvents;
var dataStateCodes;
var stateCodesMap;
var dataStateConfirmedCasesDateNested = {};
var dataDateRange;
var currDate;
var dataCoronaSvgPaths;
var stateToCentroids = {};

computeDims();

setLayoutSizings();

d3.select("div.tooltip").style("opacity", 0);

var mode = getMode();
var casesDataFile = (mode == 'deaths') ? DATA_STATE_DEATHS : DATA_STATE_CONFIRMED_CASES;
var caseEventsDataFile = (mode == 'deaths') ? "data/usa_state_deaths_events.json" : DATA_STATE_CONFIRMED_CASE_EVENTS;

Promise.all([d3.json(DATA_USMAP_TOPJSON),
             d3.csv(DATA_STATE_CODES),
             d3.csv(casesDataFile, function (d) {
                 d.Date = timeParser(d.Date);
                 d.Count = +d.Count;
                 return d;
             }),
            d3.json(caseEventsDataFile),
            d3.json(DATA_IDS),
            d3.json(DATA_CORONA_SVG)])
    .then(function (datasets) {

        init();

        loadDataSets(datasets);

        generateScales();

        renderAxes();

        buildEventTimeline();

        addNavigationControls();

        // Hidden corona bubble to compute the size and positions for the actual corona bubbles
        renderCoronaBubbles(d3.select("#corona-template"));

        buildLegend();        

        topojson.feature(dataUSTopJson, dataUSTopJson.objects.counties).features.map(function (d) {
            countyFeaturesMap[d.id] = d;
        });

        topojson.feature(dataUSTopJson, dataUSTopJson.objects.states).features.map(function (d) {
            var stateCode = getStateCodeByFIPSCode(d.id);
            stateFeaturesMap[stateCode] = d;
            stateToCentroids[stateCode] = geoPath.centroid(d);
        });

        var t = d3.nest()
            .key(function (d) {  
                return d.Date;  
            })
            .entries(dataDatewiseStateCases);
        t.forEach(function (d) {
            var casesByState = {};
            d.values.forEach(function (d2) {
                casesByState[d2.State] = d2;
            });
            dataStateConfirmedCasesDateNested[d.key] = casesByState;
        });

        stateCodes = Object.keys(stateCodesMap);
        
        var mapGroup = d3.select("#map-grp")
        mapGroup.append("path")
            .datum(topojson.feature(dataUSTopJson, dataUSTopJson.objects.nation))
            .attr("fill", "white")
            .attr("d", geoPath)
            .on("mousemove", function(d, i) { // vesingav
                // console.log(d3.mouse(this));
                // d3.select("div.tooltip")
                //     .style("opacity", .75);		

                // d3.select("div.tooltip").html("Hello")
                //     .style("left", (d3.event.pageX) + "px")		
                //     .style("top", (d3.event.pageY - 52) + "px");
            });

        mapGroup.append("path")
            .datum(topojson.mesh(dataUSTopJson, dataUSTopJson.objects.states, (a, b) => a !== b))
            .attr("fill", "none")
            .attr("stroke", function (d, i) {
                return "black";
            })
            .attr("stroke-linejoin", "round")
            .attr("d", geoPath);
            // .on("mousemove", function() {
                
            //     d3.select("div.tooltip")
            //         .style("opacity", .75);		

            //     d3.select("div.tooltip").html("Hello")
            //         .style("left", (d3.event.pageX) + "px")		
            //         .style("top", (d3.event.pageY - 52) + "px");
            // })
            // .on("mouseout", function (d, i) {
            //     d3.select("div.tooltip")
            //         .transition()		
            //         .duration(200)		
            //         .style("opacity", 0);                
            // })

        var bubblesHolder = mapGroup.append("g")
            .attr("class", "bubbles")
            .attr("display", "none");
        
        // redrawStory();

        // Initial pause before starting the animation, to let user read through the layout
        d3.timeout(function() {
            redrawStory();
        }, EVENT_PAUSE_INTERVAL);        
    });

function redrawStory() {
    // clearDrawings();
    
    currDate = totalTimeLineRange[0];

    if (timer != null) {
        timer.stop();
    }
    timer = d3.interval(callback(), ANIMATION_INTERVAL);
    renderChart(currDate);
}


function renderChart(date) {
    var nthDay = (date.getTime() - totalTimeLineRange[0].getTime()) / ONE_DAY + 1;

    if (date < dataDateRange[0]) {
        return;
    }

    var confirmedCasesByState = dataStateConfirmedCasesDateNested[date]; 
    var coronaBubblesHolder = d3.select("#" + IDs.CoronaBubblesGrp);
    var coronaBubbles = coronaBubblesHolder.selectAll("g").data(stateCodes);
    var coronaBubbleGrps = coronaBubbles.enter()
        .append("g")
        .attr("id", function (stateCode) {
            return "corona-" + stateCode;
        })
        .attr("data-state", function (stateCode) {
            return stateCode;
        })
        .attr("data-centroid-x", function (stateCode) {
            return stateToCentroids[stateCode][0];
        })
        .attr("data-centroid-y", function (stateCode) {
            return stateToCentroids[stateCode][1];
        })                                                
        .attr("transform", function (stateCode) {
            if (stateFeaturesMap[stateCode]) {
                var cx = geoPath.centroid(stateFeaturesMap[stateCode])[0];
                var cy = geoPath.centroid(stateFeaturesMap[stateCode])[1];
                var scaleFactor = Scales.CoronaBubbleRadius(+confirmedCasesByState[stateCode].Count);
                var bboxDims = getCoronaBubbleBoxDims(scaleFactor);

                return `translate(${cx-bboxDims[0]/2}, ${cy-bboxDims[1]/2}) scale(${scaleFactor})`;
            }
        })
        .attr("fill", "red")
        .attr("stroke", "white");

    coronaBubbleGrps.on("mouseover", function (stateCode, i) {
        var stateStats = getStateStats(stateCode);

        if (mode == 'newCases') {
            d3.select("#tooltip-header")
            .html('Positive Cases Summary:');                
        }
        else {
            d3.select("#tooltip-header")
            .html('Death Cases Summary:');                  
        }        

        d3.select("#tooltip-state")
            .html(getStateCodeInfo(stateCode).State);

        d3.select("#tooltip-peak-1d-count")
            .html(stateStats.Peek1DCount);

        d3.select("#tooltip-peak-1d-on")
            .html(dateMonthTimeFormatter(stateStats.Peek1DOn));  

        d3.select("#tooltip-total")
            .html(stateStats.Total);            

        d3.select("div.tooltip")
            .style("left", (d3.event.pageX) + "px")		
            .style("top", (d3.event.pageY - 100) + "px");              
        
        d3.select(this).style("fill-opacity", "1");
        d3.select(this).attr("stroke", "white");

        d3.select("div.tooltip").transition()		
            .duration(200)		
            .style("opacity", .75); 
    });

    coronaBubbleGrps.on("mouseout", function (d, i) {
        d3.select("div.tooltip").transition()		
            .duration(200)		
            .style("opacity", 0);
    });

    coronaBubbleGrps.on("click", function (d, i) {
        console.log("click");
    })
        
    renderCoronaBubbles(coronaBubbleGrps);

    var coronaBubblesTransition = coronaBubbles.transition();
    coronaBubblesTransition
        .ease(d3.easeLinear)
        .duration(ANIMATION_INTERVAL)
        .attr("transform", function (stateCode) {
            if (stateFeaturesMap[stateCode]) {
                var cx = geoPath.centroid(stateFeaturesMap[stateCode])[0];
                var cy = geoPath.centroid(stateFeaturesMap[stateCode])[1];
                var scaleFactor = Scales.CoronaBubbleRadius(+confirmedCasesByState[stateCode].Count);
                var bboxDims = getCoronaBubbleBoxDims(scaleFactor);

                return `translate(${cx-bboxDims[0]/2}, ${cy-bboxDims[1]/2}) scale(${scaleFactor})`;
            }
        });   
    coronaBubbleGrps.exit().remove();

    moveTimelineToDate(date);
}

var callback = function() {
    return function () {
        currDate = new Date(currDate.getTime() + ONE_DAY);
        if (currDate <= dataDateRange[1]) {
            renderChart(currDate);
        }
        else {
            console.log('Timer stopped');
            timer.stop();

            d3.timeout(function() {
                // initiateCoronaBubbleAnimation();
            }, 10000);
        }
        return true;
    }
}

function init() {
    if (mode == 'newCases') {
        d3.select(".chart-title")
            .text("USA COVID'19 Journey - Growth of Positive Cases Across States");
    }
    else if (mode == 'deaths') {
        d3.select(".chart-title")
        .text("USA COVID'19 Journey - Growth of Deaths Across States");
    }
}

function computeDims() {
    var clearance = 20;
    var totalHeight = window.innerHeight;
    var totalWidth = window.innerWidth;

    Dims.LegendChart.Width = totalWidth - Dims.EventsChart.Width; 

    Dims.MainSvg.Width = totalWidth - Dims.EventsChart.Width;
    Dims.MainSvg.Height = totalHeight;

    Dims.MainSvgChart.Width = Dims.MainSvg.Width - Dims.Margin.Left - Dims.Margin.Right;
    Dims.MainSvgChart.Height = Dims.MainSvg.Height - Dims.Margin.Top - Dims.Margin.Bottom - Dims.LegendChart.Height;


    Dims.EventsChart.Width = Dims.EventsChart.Width - clearance;
    // Dims.EventsChart.Height =  Dims.EventsChart.Height + 400;
}

function setLayoutSizings() {
    d3.select("svg#svg-main")
        .attr("width", Dims.MainSvg.Width)
        .attr("height", Dims.MainSvg.Height); 
           
    d3.select("#main-chart-grp")
        .attr("transform", `translate(${Dims.Margin.Left},${Dims.Margin.Top})`);
    
    d3.select("#navigation-grp")
        .attr("transform", `translate(${Dims.EventsChart.Width - Dims.NavigationBox.Width - Dims.Margin.Right}, ${0})`);     

    d3.select("svg#svg-timeline")
        .attr("width", Dims.EventsChart.Width)
        .attr("height", Dims.EventsChart.Height);

    d3.select("#timeline-chart-grp")
        .attr("transform", `translate(${Dims.Margin.Left}, ${Dims.Margin.Top})`);

    d3.select("#timeline-chart-grp").append("g")
        .attr("class", "timeline-chart-axis-grp")
        .attr("transform", "translate(10,0)");

    d3.select("#timeline-chart-grp").append("g")
        .attr("class", "timeline-chart-caption-grp")
        .attr("transform", "translate(30,0)");   
        
    d3.select("#map-grp")
        .attr("transform", `translate(${Dims.Margin.Left},${Dims.Margin.Top}) scale(0.9)`);

    d3.select("#main-chart-controls-grp")
        .attr("transform", `translate(${Dims.Margin.Left},${Dims.Margin.Top})`);

    d3.select("#corona-bubbles-grp-p")
        .attr("transform", `translate(${Dims.Margin.Left},${Dims.Margin.Top}) scale(0.9)`);

    d3.select("#legend-grp")
        .attr("transform", `translate(${Dims.MainSvg.Width*1/2},${Dims.MainSvg.Height - Dims.LegendChart.Height})`);

    d3.select("#legend-bubbles-grp")
        .attr("transform", `translate(scale(0.9))`)        
}

function initiateCoronaBubbleAnimation() {
    d3.select("#" + IDs.CoronaBubblesGrp).selectAll("g")
        .transition()
        .ease(d3.easeLinear)
        .duration(5000)
        .attrTween("transform", function () {
            var currCoronaBubble = d3.select(this);
            var centX = currCoronaBubble.attr("data-centroid-x");
            var centy = currCoronaBubble.attr("data-centroid-y");
            var currTransform = d3.select(this).attr("transform");
            if (currTransform.indexOf("rotate") != -1) {
                currTransform = currTransform.substring(0, currTransform.indexOf("rotate"));
            }
            currTransform.trim();
            return function(t) {
                return `${currTransform} rotate(${t * 180} ${d3.select("#corona-bubbles-grp-p").node().getBBox().width/2} ${d3.select("#corona-bubbles-grp-p").node().getBBox().height/2})`;
            };
        });
        // .attr("transform" , function (d, i) {
        //     var currCoronaBubble = d3.select(this);
        //     console.log(currCoronaBubble.attr("transform"));
        //     console.log(currCoronaBubble.attr("data-state") + "->" + currCoronaBubble.attr("data-centroid-x")
        //         + "," + currCoronaBubble.attr("data-centroid-y"));
        //     var centX = currCoronaBubble.attr("data-centroid-x");
        //     var centy = currCoronaBubble.attr("data-centroid-y");
        //     return d3.select(this).attr("transform") + " " + `rotate(90, ${centX}, ${centy})`;
        // })
}

function initiateCoronaBubbleAnimation2() {
    console.log("aasssds");
    d3.select("#" + IDs.CoronaBubblesGrp).selectAll("g")
        .transition()
        .ease(d3.easeLinear)
        .duration(5000)
        .attr("transform" , function (d, i) {
            var currCoronaBubble = d3.select(this);
            console.log(currCoronaBubble.attr("transform"));
            console.log(currCoronaBubble.attr("data-state") + "->" + currCoronaBubble.attr("data-centroid-x")
                + "," + currCoronaBubble.attr("data-centroid-y"));
            var centX = currCoronaBubble.attr("data-centroid-x");
            var centy = currCoronaBubble.attr("data-centroid-y");
            return d3.select(this).attr("transform") + " " + `rotate(90, ${centX}, ${centy})`;
        })
}

function renderAxes() {
    d3.select(".timeline-chart-axis-grp")
        .attr("stroke", "white")
        .attr("fill", "none")    
        .call(d3.axisLeft(Scales.TimeLineScale)
                .tickValues(Scales.TimeLineScale.ticks(d3.timeMonth.every(1)).concat(Scales.TimeLineScale.domain()))
                .tickSize(10)
                .tickFormat(d => {
                    return dateMonthTimeFormatter(d);
                })                
        )
        .call(g => g.select(".domain").remove());
}

function renderCoronaBubbles(selection) {
    selection.selectAll("path")
                .data(dataCoronaSvgPaths)
                .enter()
                .append("path")
                .attr("d", function (d) {
                    return d;
                });
}

function getCoronaBubbleBoxDims(scaleFactor) {
    var dims = [];
    // This is a hidden corona bubble to compute box dims
    d3.select("#corona-template")
        .attr("transform", `scale(${scaleFactor})`);
    var templateBBox = d3.select("#corona-template-p").node().getBBox();
    dims.push(templateBBox.width);
    dims.push(templateBBox.height);

    return dims;
}

function moveTimelineToDate(currDate) {
    d3.select("#" + IDs.EventTimelineInnerRect)
        .transition()
        .ease(d3.easeLinear)
        .duration(ANIMATION_INTERVAL)
        .attr("height", Scales.TimeLineScale(currDate));

    if (dataStateEvents[timeFormatter(currDate)]) {
        
        d3.select("#" + IDs.EventTimelineInnerCir + timeFormatterHyphen(currDate))
            .transition()
            .ease(d3.easeLinear)
            .duration(ANIMATION_INTERVAL)
            .attr("fill-opacity", 1);

        d3.select("#" + IDs.EventTimelineText + timeFormatterHyphen(currDate))
            .transition()
            .ease(d3.easeLinear)
            .duration(ANIMATION_INTERVAL)
            .attr("fill-opacity", 1);
        

        var pauseOnEvents = d3.select("#pauseonevt-control-soc").node().value;

        if (pauseOnEvents == 'Y') {
            timer.stop();
            d3.timeout(function() {
                timer.restart(callback());
            }, EVENT_PAUSE_INTERVAL);
        }
        else {
            // Do not stop the timer;
        }
    }    
}

function getKeyByValue(obj, val) {
    return Object.entries(obj).find(i => i[1] === val);
}

function getStateCodeByFIPSCode(fipsCode) {
    return Object.keys(stateCodesMap).find(stateCode => stateCodesMap[stateCode].FIPS == fipsCode);
}

function buildLegend() {
    var ticks = Scales.CoronaBubbleRadius.ticks(3);
    ticks = ticks.filter(function(d) {
        return d != 0;
    });

    var legendBBoxDims = [];
    var legendTickXYPositions = [];
    var scaleFactors = [];
    ticks.forEach(function (d, i) {
        var scaleFactor = Scales.CoronaBubbleRadius(d);
        var bboxDims = getCoronaBubbleBoxDims(scaleFactor);
        scaleFactors.push(scaleFactor);
        var xy = [];
        if (i == 0) {
            xy.push(bboxDims[0]);
        }
        else {
            xy.push(legendTickXYPositions[legendTickXYPositions.length-1][0] + bboxDims[0]);
        }

        xy.push(Dims.LegendChart.Height - bboxDims[1]);
        legendTickXYPositions.push(xy);
        legendBBoxDims.push(bboxDims);
    });

    var legendItemGrps = d3.select(".legend-bubbles-grp").selectAll("g")
        .data(ticks)
        .enter()
        .append("g")
        .attr("transform", function (d, i) {
            return `translate(${legendTickXYPositions[i][0]}, ${legendTickXYPositions[i][1]})`;
        })
        .attr("class", "legend-bubble-grp");

    legendItemGrps.append("text")
        .attr("class", "legend-txt")
        .attr("x", function (d, i) {
            return legendBBoxDims[i][0]/2;
        })
        .attr("y", -2)
        .attr("text-anchor", "middle")
        .text(function (d, i) {
            return formatNice(d);
        });       

    var legendItemBubbleGrps = legendItemGrps.append("g").attr("transform", function(d,i) {
        return `scale(${scaleFactors[i]})`;
    })

    renderCoronaBubbles(legendItemBubbleGrps);
}

function formatNice(num) {
    var val = num;
    if(num%1000 == 0) {
        val = num/1000 + "k";
    }
    return val;
}

function loadDataSets(datasets) {
    dataUSTopJson = datasets[0];
    dataStateCodes = datasets[1];
    dataDatewiseStateCases = datasets[2];
    dataStateEvents = datasets[3];
    IDs = datasets[4];
    dataCoronaSvgPaths = datasets[5];  

    stateCodesMap = {};
    dataStateCodes.forEach(function (d) {
        stateCodesMap[d.StateCode.trim()] = d;
    });        

    // This is a geoMap where we will display only state information. Filter out derived info like _USA, _OthersTop5
    dataDatewiseStateCases = dataDatewiseStateCases.filter(function (d) {
        return !d.State.startsWith("_");
    })
    
    dataDateRange = d3.extent(dataDatewiseStateCases, function (d) {
        return d.Date;
    });    
}

function generateScales() {
    Scales.CoronaBubbleRadius = d3.scaleSqrt()
        .domain([0, d3.max(dataDatewiseStateCases, function (d) {
            return +d.Count;
        })])
        .range([0, 0.2]);

    Scales.TimeLineScale = d3.scaleTime()
        .domain(totalTimeLineRange)
        .range([0, Dims.EventsChart.Height - 200]);  
}

function addNavigationControls() {
    d3.select(".navig-refresh-ctrl-grp")
        .on("mousemove", function() {
            d3.select(".navig-refresh-ctrl").attr("stroke", "yellow");
        })
        .on("mouseout", function() {
            d3.select(".navig-prev-ctrl").attr("stroke", "red");
        })
        .on("click", function() {
            window.location.href = window.location.href;
        });

    d3.select(".navig-prev-ctrl-grp")
        .on("mousemove", function() {
            d3.select(".navig-prev-ctrl").attr("stroke", "yellow");
        })
        .on("mouseout", function() {
            d3.select(".navig-prev-ctrl").attr("stroke", "red");
        })
        .on("click", function() {
            if (mode == 'deaths') {
                window.location.href = "USStateCovidCasesGeoMap.html?mode=newCases";
            }
            else {
                window.location.href = "index.html";
            }
        });

    d3.select(".navig-home-ctrl-grp")
        .on("mousemove", function() {
            d3.select(".navig-home-ctrl").attr("stroke", "yellow");
        })
        .on("mouseout", function() {
            d3.select(".navig-home-ctrl").attr("stroke", "red");
        })
        .on("click", function() {
            window.location.href = "index.html";
        });    

    d3.select(".navig-next-ctrl-grp")
        .on("mousemove", function() {
            d3.select(".navig-next-ctrl").attr("stroke", "yellow");
        })
        .on("mouseout", function() {
            d3.select(".navig-next-ctrl").attr("stroke", "red");
        })
        .on("click", function() { 
            if (mode == 'newCases') {
                window.location.href = "USStateCovidCasesGeoMap.html?mode=deaths";
            }
            else {
                window.location.href = 'USStateCovidRollingAverage.html';
            }
        });                   
}

function buildEventTimeline() {
    const timelineAxisWidth = 3;              

    var highlightsAxisGrp = d3.select(".timeline-chart-axis-grp");
    var highlightsCaptionGrp = d3.select(".timeline-chart-caption-grp");
    highlightsAxisGrp.append("rect")
        .attr("id", IDs.EventTimelineOuterRect)
        .attr("class", IDs.EventTimelineOuterRect)
        .attr("x", 0)
        .attr("y", 0)
        .attr("width", timelineAxisWidth)
        .attr("height", Dims.EventsChart.Height - 200)
        .attr("fill-opacity", "0.25");

    highlightsAxisGrp.append("rect")
        .attr("id", IDs.EventTimelineInnerRect)
        .attr("class", IDs.EventTimelineInnerRect)
        .attr("x", 0)
        .attr("y", 0)
        .attr("width", timelineAxisWidth)
        .attr("height", 0)
        .attr("fill-opacity", "1");

    highlightsAxisGrp.selectAll("circle." + IDs.EventTimelineOuterCir)
        .data(Object.keys(dataStateEvents))
        .enter()
        .append("circle")
        .attr("class", IDs.EventTimelineOuterCir)
        .attr("cx", function (d, i) {
            return timelineAxisWidth/2;
        })
        .attr("cy", function (d, i) {
            return Scales.TimeLineScale(timeParser(d));
        })
        .attr("r", 5);

    highlightsAxisGrp.selectAll("circle." + IDs.EventTimelineInnerCir)
        .data(Object.keys(dataStateEvents))
        .enter()
        .append("circle")
        .attr("id", function (d, i) {
            return IDs.EventTimelineInnerCir + timeFormatterHyphen(timeParser(d));
        })
        .attr("class", IDs.EventTimelineInnerCir)
        .attr("cx", function (d, i) {
            return timelineAxisWidth/2;
        })
        .attr("cy", function (d, i) {
            return Scales.TimeLineScale(timeParser(d));
        })
        .attr("r", 4)
        .attr("fill-opacity", 0);
    
    highlightsCaptionGrp.selectAll("text")
        .data(Object.keys(dataStateEvents))
        .enter()
        .append("text")
        .attr("id", function (d, i) {
            return IDs.EventTimelineText + timeFormatterHyphen(timeParser(d));
        })
        .attr("class", "event-timeline-axis")
        .attr("fill", "black")
        .attr("fill-opacity", "0")
        .attr("dominant-baseline", "middle")
        .attr("x", function (d, i) {
            return 0;
        })
        .attr("y", function (d, i) {
            return Scales.TimeLineScale(timeParser(d));
        })
        .text(function (d, i) {
            return "[" + d + "] " + dataStateEvents[d];
        });
}

function roundNice(num) {
    console.log(num);
    // Round to nearest 1000s
    if (num > 1000 && num < 10000) {
        num = Math.ceil(num/1000) * 1000;
    }
    else if (num > 10000) {
        num = Math.ceil(num/10000) * 10000;
    }   

    return num;
}

function getMode() {
    var queryParams = location.search.replace('\?','').split('&');
    var modeType = queryParams.find(function (d) {
        if (d.startsWith("mode=")) {
            return true;
        }
        return false;
    });
    
    if (modeType == undefined || modeType == null) {
        modeType = 'newCases';
    }
    else {
        modeType = modeType.substring("mode=".length);
        if (modeType != 'newCases' && modeType != 'deaths') {
            modeType = "newCases";
        }
    }
    return modeType;
}

function getStateCodeInfo(stateCode) {
    return stateCodesMap[stateCode];
}

function getStateStats(stateCode) {
    var stats = {}
    stats.Peek1DCount = -1;
    stats.PeekAvg = -1;
    stats.Total = -1;
    dataDatewiseStateCases.forEach(function (d) {
        if (d.State == stateCode) {

            if (d.NewCount > stats.Peek1DCount) {
                stats.Peek1DCount = d.NewCount;
                stats.Peek1DOn = d.Date;
            }

            if (d['7DayAvg'] > stats.PeekAvg) {
                stats.PeekAvg = d['7DayAvg'];
                stats.PeekAvgOn = d.Date;
            }

            if (d['Count'] > stats.Total) {
                stats.Total = d['Count'];
            }
        }
    });

    
    return stats;
}